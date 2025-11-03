import { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, BookOpen, Headphones, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { storage } from '@/lib/storage';
import { useLanguage } from '@/contexts/LanguageContext';
import { Language } from '@/lib/i18n';
import { audioService } from '@/lib/audioService';

interface Moshaf {
  id: number;
  name: string;
  server: string;
  surah_total: number;
  moshaf_type: number;
  surah_list: string;
}

interface Reciter {
  id: number;
  name: string;
  letter: string;
  date: string;
  moshaf: Moshaf[];
}

interface Surah {
  id: number;
  name: string;
  start_page: number;
  end_page: number;
  makkia: number;
  type: number;
}

const API_BASE = 'https://www.mp3quran.net/api/v3';

function App() {
  const { language, setLanguage, t, isLanguageLoaded } = useLanguage();
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [selectedReciter, setSelectedReciter] = useState<Reciter | null>(null);
  const [selectedMoshaf, setSelectedMoshaf] = useState<Moshaf | null>(null);
  const [selectedSurah, setSelectedSurah] = useState<Surah | null>(null);
  const [currentSurahIndex, setCurrentSurahIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const previousVolumeRef = useRef<number>(1.0);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

  // Fetch reciters
  const fetchReciters = async (lang: Language = language) => {
    try {
      const response = await fetch(`${API_BASE}/reciters?language=${lang}`);
      const data = await response.json();
      if (data.reciters) {
        console.log('Fetched reciters:', data.reciters.length);
        setReciters(data.reciters);
      }
    } catch (error) {
      console.error('Error fetching reciters:', error);
    }
  };

  // Fetch surahs
  const fetchSurahs = async (lang: Language = language) => {
    try {
      const response = await fetch(`${API_BASE}/suwar?language=${lang}`);
      const data = await response.json();
      if (data.suwar) {
        setSurahs(data.suwar);
      }
    } catch (error) {
      console.error('Error fetching surahs:', error);
    }
  };

  // Track if this is the initial load to avoid resetting on language restore
  const hasLoadedInitialDataRef = useRef(false);
  const prevLanguageRef = useRef<Language | null>(null);

  // Load saved preferences on mount with correct language (wait for language to be loaded)
  useEffect(() => {
    if (!isLanguageLoaded || hasLoadedInitialDataRef.current) return; // Wait for language to be loaded and only run once
    
    const loadPreferences = async () => {
      setIsLoading(true);
      // Fetch data with the loaded language (use the current language value)
      await Promise.all([fetchReciters(language), fetchSurahs(language)]);
      setIsLoading(false);
      hasLoadedInitialDataRef.current = true;
      prevLanguageRef.current = language;
    };
    
    loadPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLanguageLoaded]); // Intentionally only depend on isLanguageLoaded - language will be correct when this runs

  // Refetch data when language changes (but not on initial load)
  useEffect(() => {
    if (hasLoadedInitialDataRef.current && isLanguageLoaded && prevLanguageRef.current && prevLanguageRef.current !== language) {
      // Only refetch if language actually changed after initial load
      fetchReciters(language);
      fetchSurahs(language);
      // Reset selections when language changes (but not on initial load)
      setSelectedReciter(null);
      setSelectedMoshaf(null);
      setSelectedSurah(null);
      prevLanguageRef.current = language;
    }
  }, [language, isLanguageLoaded]);

  // Load volume preference on mount and sync with audio service
  useEffect(() => {
    const loadVolume = async () => {
      const result = await storage.get(['volume']);
      if (result.volume !== undefined) {
        const savedVolume = parseFloat(result.volume);
        if (!isNaN(savedVolume) && savedVolume >= 0 && savedVolume <= 1) {
          setVolume(savedVolume);
          previousVolumeRef.current = savedVolume;
          await audioService.setVolume(savedVolume);
        }
      } else {
        // Get current state from audio service
        const state = await audioService.getState();
        if (state.volume > 0) {
          setVolume(state.volume);
          previousVolumeRef.current = state.volume;
        }
      }
    };
    loadVolume();
  }, []);

  // Listen to audio state updates from offscreen document
  useEffect(() => {
    // Get initial state
    audioService.getState().then((state) => {
      setIsPlaying(state.isPlaying);
      setCurrentTime(state.currentTime);
      setDuration(state.duration);
      setVolume(state.volume);
      setIsMuted(state.isMuted);
      previousVolumeRef.current = state.volume;
    });

    // Subscribe to updates
    const unsubscribe = audioService.onStateUpdate((state) => {
      setIsPlaying(state.isPlaying);
      if (!isSeeking) {
        setCurrentTime(state.currentTime);
      }
      setDuration(state.duration);
      setVolume(state.volume);
      setIsMuted(state.isMuted);
    });

    // Listen for audio ended to auto-play next surah
    const handleMessage = (message: any) => {
      if (message.type === 'AUDIO_ENDED') {
        setIsPlaying(false);
        setCurrentTime(0);
        // Auto-play next surah if available
        if (currentSurahIndex < surahs.length - 1 && selectedReciter && selectedMoshaf) {
          const nextSurah = surahs[currentSurahIndex + 1];
          setCurrentSurahIndex(currentSurahIndex + 1);
          setSelectedSurah(nextSurah);
          savePreferences(selectedReciter.id, selectedMoshaf.id, nextSurah.id);
          loadAudio(selectedMoshaf, nextSurah);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      unsubscribe();
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [currentSurahIndex, surahs, selectedReciter, selectedMoshaf, isSeeking]);

  // Update preferences when reciters/surahs load
  useEffect(() => {
    const loadPreferences = async () => {
      if (reciters.length > 0 && surahs.length > 0 && !selectedReciter) {
        const result = await storage.get(['reciterId', 'moshafId', 'surahId']);
        if (result.reciterId && result.surahId) {
          const reciter = reciters.find(r => r.id === parseInt(result.reciterId));
          const surah = surahs.find(s => s.id === parseInt(result.surahId));
          
          if (reciter) {
            setSelectedReciter(reciter);
            
            // Try to find saved moshaf, or use first one
            let moshaf: Moshaf | null = null;
            if (result.moshafId) {
              moshaf = reciter.moshaf.find(m => m.id === parseInt(result.moshafId)) || null;
            }
            if (!moshaf && reciter.moshaf.length > 0) {
              moshaf = reciter.moshaf[0];
            }
            
            if (moshaf) {
              setSelectedMoshaf(moshaf);
            }
            
            if (surah) {
              setSelectedSurah(surah);
              setCurrentSurahIndex(surahs.findIndex(s => s.id === surah.id));
              
              if (moshaf) {
                loadAudio(moshaf, surah);
              }
            }
          }
        }
      }
    };
    loadPreferences();
  }, [reciters, surahs]);

  // Save preferences
  const savePreferences = async (reciterId: number, moshafId: number, surahId: number) => {
    await storage.set({
      reciterId: reciterId.toString(),
      moshafId: moshafId.toString(),
      surahId: surahId.toString(),
    });
  };

  // Handle reciter selection
  const handleReciterChange = async (reciterId: string) => {
    const reciter = reciters.find(r => r.id === parseInt(reciterId));
    if (reciter) {
      setSelectedReciter(reciter);
      // Reset moshaf when reciter changes
      setSelectedMoshaf(null);
      
      // Auto-select first moshaf if available
      if (reciter.moshaf && reciter.moshaf.length > 0) {
        const firstMoshaf = reciter.moshaf[0];
        setSelectedMoshaf(firstMoshaf);
        if (selectedSurah && firstMoshaf) {
          savePreferences(reciter.id, firstMoshaf.id, selectedSurah.id);
          await loadAudio(firstMoshaf, selectedSurah);
        }
      }
    } else {
      console.error('Reciter not found with id:', reciterId);
    }
  };

  // Handle moshaf selection
  const handleMoshafChange = async (moshafId: string) => {
    if (!selectedReciter) return;
    
    const moshaf = selectedReciter.moshaf.find(m => m.id === parseInt(moshafId));
    if (moshaf) {
      setSelectedMoshaf(moshaf);
      if (selectedSurah) {
        savePreferences(selectedReciter.id, moshaf.id, selectedSurah.id);
        await loadAudio(moshaf, selectedSurah);
      }
    }
  };

  // Handle surah selection
  const handleSurahChange = async (surahId: string) => {
    const surah = surahs.find(s => s.id === parseInt(surahId));
    if (surah && selectedReciter && selectedMoshaf) {
      setSelectedSurah(surah);
      setCurrentSurahIndex(surahs.findIndex(s => s.id === surah.id));
      savePreferences(selectedReciter.id, selectedMoshaf.id, surah.id);
      await loadAudio(selectedMoshaf, surah);
    }
  };

  // Load audio
  const loadAudio = async (moshaf: Moshaf, surah: Surah) => {
    if (!moshaf || !surah) {
      console.error('Cannot load audio: missing moshaf or surah', {
        moshaf,
        surah
      });
      setIsLoadingAudio(false);
      return;
    }

    // Validate that server URL exists
    if (!moshaf.server) {
      console.error('Moshaf missing server URL:', moshaf);
      alert('Selected moshaf is missing server URL. Please select a different moshaf.');
      setIsLoadingAudio(false);
      return;
    }

    setIsLoadingAudio(true);

    const audioUrl = `${moshaf.server}${surah.id.toString().padStart(3, '0')}.mp3`;
    
    console.log('Loading audio:', {
      url: audioUrl,
      moshafId: moshaf.id,
      moshafName: moshaf.name,
      surahId: surah.id,
      surahName: surah.name,
      server: moshaf.server
    });
    
    // Reset playing state before loading new audio
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    
    try {
      await audioService.loadAudio(audioUrl);
      // Wait a bit for audio to load metadata
      await new Promise(resolve => setTimeout(resolve, 100));
      // Get updated state
      const state = await audioService.getState();
      setDuration(state.duration);
      setIsLoadingAudio(false);
    } catch (error) {
      console.error('Error loading audio:', error);
      setIsLoadingAudio(false);
      alert('Failed to load audio. Please try again.');
    }
  };

  // Navigate to next surah
  const handleNext = async () => {
    if (currentSurahIndex < surahs.length - 1 && selectedReciter && selectedMoshaf) {
      const nextSurah = surahs[currentSurahIndex + 1];
      setCurrentSurahIndex(currentSurahIndex + 1);
      setSelectedSurah(nextSurah);
      savePreferences(selectedReciter.id, selectedMoshaf.id, nextSurah.id);
      await loadAudio(selectedMoshaf, nextSurah);
    }
  };

  // Navigate to previous surah
  const handlePrevious = async () => {
    if (currentSurahIndex > 0 && selectedReciter && selectedMoshaf) {
      const prevSurah = surahs[currentSurahIndex - 1];
      setCurrentSurahIndex(currentSurahIndex - 1);
      setSelectedSurah(prevSurah);
      savePreferences(selectedReciter.id, selectedMoshaf.id, prevSurah.id);
      await loadAudio(selectedMoshaf, prevSurah);
    }
  };

  // Play/Pause toggle
  const togglePlayPause = async () => {
    if (!selectedReciter || !selectedMoshaf || !selectedSurah) {
      console.error('Cannot play: missing requirements', {
        hasReciter: !!selectedReciter,
        hasMoshaf: !!selectedMoshaf,
        hasSurah: !!selectedSurah
      });
      return;
    }

    // Validate moshaf has server URL
    if (!selectedMoshaf.server) {
      console.error('Selected moshaf missing server URL:', selectedMoshaf);
      alert('Selected moshaf is missing server URL. Please select a different moshaf.');
      return;
    }

    try {
      if (isPlaying) {
        await audioService.pause();
        return;
      }

      // Ensure audio is loaded before playing
      // Check current state and reload if needed
      const currentState = await audioService.getState();
      const needsReload = !currentState.isPlaying && (duration === 0 || currentTime === 0);
      
      if (needsReload) {
        await loadAudio(selectedMoshaf, selectedSurah);
        // Wait a bit for audio to be ready
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Play the audio
      await audioService.play();
      console.log('Audio play started successfully');
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
      
      // More specific error messages
      let errorMsg = 'Unable to play audio. ';
      if (error instanceof Error) {
        if (error.message.includes('CORS') || error.message.includes('SRC_NOT_SUPPORTED')) {
          errorMsg += 'The audio server may not allow playback from this page. This might be a CORS issue.';
        } else if (error.message.includes('NotSupportedError')) {
          errorMsg += 'The audio format is not supported or the file could not be loaded.';
        } else {
          errorMsg += error.message;
        }
      } else {
        errorMsg += 'Please check your internet connection and try again.';
      }
      
      alert(errorMsg);
    }
  };

  // Format time helper
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    // Show hours if 60 minutes or more
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Otherwise show MM:SS format
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle progress bar click/drag
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;

    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, clickX / width));
    const newTime = percentage * duration;

    audioService.setTime(newTime);
    setCurrentTime(newTime);
  };

  // Handle progress bar drag
  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsSeeking(true);
    handleProgressClick(e);
  };

  // Handle volume change
  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeRef.current) return;

    const rect = volumeRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, clickX / width));
    const newVolume = percentage;

    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    previousVolumeRef.current = newVolume > 0 ? newVolume : previousVolumeRef.current;
    audioService.setVolume(newVolume);
    storage.set({ volume: newVolume.toString() });
  };

  // Handle volume drag
  const [isVolumeSeeking, setIsVolumeSeeking] = useState(false);
  const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsVolumeSeeking(true);
    handleVolumeClick(e);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isVolumeSeeking || !volumeRef.current) return;
      
      const rect = volumeRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const percentage = Math.max(0, Math.min(1, clickX / width));
      const newVolume = percentage;
      
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
      previousVolumeRef.current = newVolume > 0 ? newVolume : previousVolumeRef.current;
      audioService.setVolume(newVolume);
    };

    const handleMouseUp = () => {
      if (isVolumeSeeking) {
        storage.set({ volume: volume.toString() });
      }
      setIsVolumeSeeking(false);
    };

    if (isVolumeSeeking) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isVolumeSeeking, volume]);

  // Toggle mute
  const toggleMute = () => {
    if (isMuted) {
      // Unmute - restore previous volume
      const newVolume = previousVolumeRef.current > 0 ? previousVolumeRef.current : 0.5;
      setVolume(newVolume);
      setIsMuted(false);
      audioService.setVolume(newVolume);
      storage.set({ volume: newVolume.toString() });
    } else {
      // Mute - save current volume before muting
      previousVolumeRef.current = volume;
      setIsMuted(true);
      audioService.setMuted(true);
    }
  };

  if (isLoading) {
    return (
      <div dir={direction} className={`w-full max-w-full min-h-screen bg-background islamic-pattern ${language === 'ar' ? 'font-arabic' : ''} section-main-container section-loading`}>
        {/* Header Skeleton */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-emerald-100 dark:border-emerald-900 section-header section-header-skeleton">
          <div className={`flex items-center ${direction === 'rtl' ? 'flex-row-reverse' : ''} justify-between px-3 sm:px-4 py-2 sm:py-3`}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
              <Skeleton className="h-6 sm:h-7 w-32" />
            </div>
            <Skeleton className="h-8 w-16 sm:w-20 rounded-md flex-shrink-0" />
          </div>
        </div>

        <div className="p-3 sm:p-4 flex flex-col gap-3 sm:gap-4 section-content section-content-skeleton">
          {/* Reciter Select Skeleton */}
          <div className={`flex flex-col gap-2 ${direction === 'rtl' ? 'text-right' : 'text-left'} section-reciter-select section-reciter-select-skeleton`}>
            <Skeleton className={`h-4 w-16 ${direction === 'rtl' ? 'text-right' : 'text-left'}`} />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          {/* Moshaf Select Skeleton */}
          <div className={`flex flex-col gap-2 ${direction === 'rtl' ? 'text-right' : 'text-left'} section-moshaf-select section-moshaf-select-skeleton`}>
            <Skeleton className={`h-4 w-24 ${direction === 'rtl' ? 'text-right' : 'text-left'}`} />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          {/* Surah Select Skeleton */}
          <div className={`flex flex-col gap-2 ${direction === 'rtl' ? 'text-right' : 'text-left'} section-surah-select section-surah-select-skeleton`}>
            <Skeleton className={`h-4 w-16 ${direction === 'rtl' ? 'text-right' : 'text-left'}`} />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          {/* Progress Bar Skeleton */}
          <div className="mt-4 p-4 border border-border rounded-lg section-audio-player section-audio-player-skeleton">
            <div className="mb-3">
              <Skeleton className="h-1.5 w-full rounded-full mb-2" />
              <div className="flex justify-between">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-16 w-16 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
          </div>

          {/* Current Surah Display Skeleton */}
          <div className="mt-3 p-3 rounded-md border border-border">
            <Skeleton className="h-3 w-20 mx-auto mb-2" />
            <Skeleton className="h-4 w-28 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  // Quran book icon component
  const QuranIcon = () => (
    <div className="text-emerald-600 dark:text-emerald-400">
      <BookOpen className="h-5 w-5" />
    </div>
  );

  return (
    <div dir={direction} className={`w-full max-w-full min-h-screen bg-background islamic-pattern ${language === 'ar' ? 'font-arabic' : ''} section-main-container`}>
      {/* Header with Language Switcher */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-emerald-100 dark:border-emerald-900 section-header">
        <div className={`flex items-center ${direction === 'rtl' ? 'flex-row-reverse' : ''} justify-between px-3 sm:px-4 py-2 sm:py-3`}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <QuranIcon />
            <h1 className="text-lg sm:text-xl font-semibold text-foreground truncate">
              {t.title}
            </h1>
          </div>
          <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
            <SelectTrigger className="w-16 sm:w-20 h-8 border-border flex-shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">EN</SelectItem>
              <SelectItem value="ar">AR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-3 sm:p-4 flex flex-col gap-3 sm:gap-4 section-content">
      
      {/* Reciter Select */}
      <div className={`flex flex-col gap-2 ${direction === 'rtl' ? 'text-right' : 'text-left'} section-reciter-select`}>
        <label className={`flex items-center gap-2 text-sm font-medium text-foreground ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
          <Headphones className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
          {t.reciter}
        </label>
        <Select
          value={selectedReciter?.id.toString() || ''}
          onValueChange={handleReciterChange}
        >
          <SelectTrigger className="h-10 border-border hover:border-emerald-300 dark:hover:border-emerald-700" dir={direction}>
            <SelectValue placeholder={t.selectReciter} />
          </SelectTrigger>
          <SelectContent className="max-h-[300px] w-[var(--radix-select-trigger-width)] max-w-[90vw]" dir={direction}>
            {reciters.map((reciter) => (
              <SelectItem key={reciter.id} value={reciter.id.toString()} dir={direction}>
                <span className="truncate">{reciter.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Moshaf Select */}
      {selectedReciter && selectedReciter.moshaf && selectedReciter.moshaf.length > 0 && (
        <div className={`flex flex-col gap-2 ${direction === 'rtl' ? 'text-right' : 'text-left'} section-moshaf-select`}>
          <label className={`flex items-center gap-2 text-sm font-medium text-foreground ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
            <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
            {t.moshaf}
          </label>
          <Select
            value={selectedMoshaf?.id.toString() || ''}
            onValueChange={handleMoshafChange}
          >
            <SelectTrigger className="h-10 border-border hover:border-emerald-300 dark:hover:border-emerald-700" dir={direction}>
              <SelectValue placeholder={t.selectMoshaf} />
            </SelectTrigger>
            <SelectContent className="max-h-[300px] w-[var(--radix-select-trigger-width)] max-w-[90vw]" dir={direction}>
              {selectedReciter.moshaf.map((moshaf) => (
                <SelectItem key={moshaf.id} value={moshaf.id.toString()} dir={direction}>
                  <span className="truncate">{moshaf.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Surah Select */}
      <div className={`flex flex-col gap-2 ${direction === 'rtl' ? 'text-right' : 'text-left'} section-surah-select`}>
        <label className={`flex items-center gap-2 text-sm font-medium text-foreground ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
          <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
          {t.surah}
        </label>
        <Select
          value={selectedSurah?.id.toString() || ''}
          onValueChange={handleSurahChange}
        >
          <SelectTrigger className="h-10 border-border hover:border-emerald-300 dark:hover:border-emerald-700" dir={direction}>
            <SelectValue placeholder={t.selectSurah} />
          </SelectTrigger>
          <SelectContent className="max-h-[300px] w-[var(--radix-select-trigger-width)] max-w-[90vw]" dir={direction}>
            {surahs.map((surah) => (
              <SelectItem key={surah.id} value={surah.id.toString()} dir={direction}>
                <span className="truncate">{surah.id}. {surah.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Audio Player Section */}
      <div className="mt-4 p-3 sm:p-4 border border-emerald-100 dark:border-emerald-900 rounded-lg bg-white/50 dark:bg-gray-900/50 section-audio-player">
        {/* Main Row: Progress Bar, Controls, Volume (all in one row on large screens) */}
        <div className={`flex flex-col lg:flex-row items-center lg:items-center gap-3 lg:gap-4 ${direction === 'rtl' ? 'lg:flex-row-reverse' : ''}`}>
          {/* Progress Bar */}
          <div className="w-full lg:flex-1 lg:min-w-0 mb-3 lg:mb-0 section-progress-bar">
            <div
              ref={progressRef}
              onClick={handleProgressClick}
              onMouseDown={handleProgressMouseDown}
              className="group relative h-1.5 bg-muted rounded-full cursor-pointer"
            >
              <div
                className="absolute left-0 top-0 h-full bg-emerald-600 dark:bg-emerald-500 rounded-full"
                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-emerald-600 dark:bg-emerald-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border-2 border-background"
                style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 5px)` }}
              />
            </div>
            {/* Time Display */}
            <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{formatTime(currentTime)}</span>
              <span className="tabular-nums">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Audio Controls */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 shrink-0 section-audio-controls">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevious}
              disabled={isLoadingAudio || currentSurahIndex === 0 || !selectedSurah}
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            
            <Button
              variant="default"
              size="icon"
              onClick={togglePlayPause}
              disabled={isLoading || isLoadingAudio || !selectedSurah || !selectedReciter || !selectedMoshaf}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              onClick={handleNext}
              disabled={isLoadingAudio || currentSurahIndex === surahs.length - 1 || !selectedSurah}
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Volume Control */}
          <div className={`flex items-center gap-2 w-full lg:w-auto lg:shrink-0 lg:min-w-[180px] ${direction === 'rtl' ? 'flex-row-reverse' : ''} section-volume-control`}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            title={isMuted || volume === 0 ? (language === 'ar' ? 'إلغاء كتم الصوت' : 'Unmute') : (language === 'ar' ? 'كتم الصوت' : 'Mute')}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <div
            ref={volumeRef}
            onClick={handleVolumeClick}
            onMouseDown={handleVolumeMouseDown}
            className="group relative flex-1 h-1.5 bg-muted rounded-full cursor-pointer"
          >
            <div
              className="absolute left-0 top-0 h-full bg-emerald-600 dark:bg-emerald-500 rounded-full"
              style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-emerald-600 dark:bg-emerald-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border-2 border-background"
              style={{ left: `calc(${(isMuted ? 0 : volume) * 100}% - 6px)` }}
            />
          </div>
          <span className={`text-xs text-muted-foreground w-8 tabular-nums shrink-0 ${direction === 'rtl' ? 'text-left' : 'text-right'}`}>
            {Math.round((isMuted ? 0 : volume) * 100)}%
          </span>
        </div>
        </div>
      </div>

      {/* Current Surah Display */}
      {selectedSurah && (
        <div className={`mt-3 p-2.5 sm:p-3 rounded-md border border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30 ${direction === 'rtl' ? 'text-right' : 'text-center'} section-current-surah`}>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <BookOpen className="h-3 w-3 text-emerald-600 dark:text-emerald-500 flex-shrink-0" />
            <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{t.playing}</div>
          </div>
          <div className={`text-sm sm:text-base font-semibold text-foreground truncate ${direction === 'rtl' ? 'text-right' : 'text-center'}`}>
            {selectedSurah.name}
          </div>
        </div>
      )}
      </div>

    </div>
  );
}

export default App;

