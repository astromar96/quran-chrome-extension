import { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Languages } from 'lucide-react';
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

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
    if (!audioRef.current || !moshaf || !surah) {
      console.error('Cannot load audio: missing audio element, moshaf, or surah', {
        hasAudio: !!audioRef.current,
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
    const audio = audioRef.current;
    
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
    audio.pause();
    
    // Clear previous source first
    audio.src = '';
    audio.load();
    
    // Set new source - try without crossOrigin first as it may cause CORS issues
    audio.src = audioUrl;
    // Don't set crossOrigin as it may cause CORS errors if server doesn't support it
    audio.preload = 'auto';
    
    // Load the new source
    audio.load();
    
    // Wait a bit for the source to be set
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Wait for metadata to be loaded before enabling play button
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          setIsLoadingAudio(false);
          resolve();
        }, 5000); // Fallback timeout

        const handleLoadedMetadata = () => {
          clearTimeout(timeout);
          setIsLoadingAudio(false);
          resolve();
        };

        const handleError = () => {
          clearTimeout(timeout);
          setIsLoadingAudio(false);
          reject(new Error('Failed to load audio'));
        };

        audio.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
        audio.addEventListener('error', handleError, { once: true });

        // If metadata is already loaded
        if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
          clearTimeout(timeout);
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('error', handleError);
          setIsLoadingAudio(false);
          resolve();
        }
      });
    } catch (error) {
      console.error('Error loading audio metadata:', error);
      setIsLoadingAudio(false);
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
    if (!audioRef.current || !selectedReciter || !selectedMoshaf || !selectedSurah) {
      console.error('Cannot play: missing requirements', {
        hasAudio: !!audioRef.current,
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

    const audio = audioRef.current;

    try {
      if (isPlaying) {
        audio.pause();
        return;
      }

      // Always ensure audio is loaded before playing
      const surahFileName = selectedSurah.id.toString().padStart(3, '0');
      const currentSrc = audio.src || '';
      
      // Always reload to ensure fresh state
      const needsReload = !currentSrc || !currentSrc.includes(surahFileName);
      
      if (needsReload) {
        await loadAudio(selectedMoshaf, selectedSurah);
        
        // Wait for audio to be ready before playing
        await new Promise<void>((resolve, reject) => {
          if (!audio) {
            reject(new Error('Audio element not available'));
            return;
          }

          let resolved = false;
          let timeoutId: number;

          const cleanup = () => {
            audio.removeEventListener('canplay', handleCanPlay);
            audio.removeEventListener('canplaythrough', handleCanPlayThrough);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('error', handleError);
            if (timeoutId) clearTimeout(timeoutId);
          };

          const handleCanPlay = () => {
            if (!resolved) {
              resolved = true;
              cleanup();
              console.log('Audio can play');
              resolve();
            }
          };

          const handleCanPlayThrough = () => {
            if (!resolved) {
              resolved = true;
              cleanup();
              console.log('Audio can play through');
              resolve();
            }
          };

          const handleLoadedMetadata = () => {
            console.log('Audio metadata loaded, readyState:', audio.readyState);
            // Check if we have enough data
            if (audio.readyState >= HTMLMediaElement.HAVE_METADATA && !resolved) {
              resolved = true;
              cleanup();
              resolve();
            }
          };

          const handleError = (e: Event) => {
            cleanup();
            const error = audio.error;
            console.error('Audio error:', {
              code: error?.code,
              message: error?.message,
              mediaError: error,
              event: e,
              src: audio.src
            });
            
            let errorMsg = 'Failed to load audio';
            if (error) {
              switch (error.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                  errorMsg = 'Audio loading was aborted';
                  break;
                case MediaError.MEDIA_ERR_NETWORK:
                  errorMsg = 'Network error loading audio';
                  break;
                case MediaError.MEDIA_ERR_DECODE:
                  errorMsg = 'Audio decoding error';
                  break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                  errorMsg = 'Audio format not supported or CORS issue';
                  break;
              }
            }
            reject(new Error(errorMsg));
          };

          audio.addEventListener('canplay', handleCanPlay, { once: true });
          audio.addEventListener('canplaythrough', handleCanPlayThrough, { once: true });
          audio.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
          audio.addEventListener('error', handleError, { once: true });
          
          // Check current ready state
          if (audio.readyState >= HTMLMediaElement.HAVE_METADATA && audio.src) {
            if (!resolved) {
              resolved = true;
              cleanup();
              resolve();
            }
          }
          
          // Timeout fallback after 5 seconds
          timeoutId = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              cleanup();
              console.warn('Audio loading timeout, attempting to play anyway');
              resolve();
            }
          }, 5000);
        });
      }

      // Verify audio has a valid source before playing
      if (!audio.src || audio.src === window.location.href) {
        throw new Error('Audio source is not set');
      }

      // Check readyState
      if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) {
        throw new Error('Audio has no data loaded');
      }

      console.log('Attempting to play audio:', {
        src: audio.src,
        readyState: audio.readyState,
        networkState: audio.networkState
      });

      // Play the audio
      await audio.play();
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
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle progress bar click/drag
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, clickX / width));
    const newTime = percentage * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Handle progress bar drag
  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsSeeking(true);
    handleProgressClick(e);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isSeeking || !audioRef.current || !duration || !progressRef.current) return;
      
      const rect = progressRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const percentage = Math.max(0, Math.min(1, clickX / width));
      const newTime = percentage * duration;
      
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    };

    const handleMouseUp = () => {
      setIsSeeking(false);
    };

    if (isSeeking) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isSeeking, duration]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(audio.currentTime);
      }
    };
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };
    const handleDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = async () => {
      setIsPlaying(false);
      setCurrentTime(0);
      // Auto-play next surah if available
      if (currentSurahIndex < surahs.length - 1 && selectedReciter && selectedMoshaf) {
        const nextSurah = surahs[currentSurahIndex + 1];
        setCurrentSurahIndex(currentSurahIndex + 1);
        setSelectedSurah(nextSurah);
        savePreferences(selectedReciter.id, selectedMoshaf.id, nextSurah.id);
        await loadAudio(selectedMoshaf, nextSurah);
      }
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [selectedSurah, selectedReciter, selectedMoshaf, currentSurahIndex, surahs, isSeeking]);

  if (isLoading) {
    return (
      <div dir={direction} className={`w-[420px] min-h-[500px] bg-gradient-to-br from-background via-background to-muted/5 ${language === 'ar' ? 'font-arabic' : ''}`}>
        {/* Header Skeleton */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 border-b border-border/50 shadow-sm">
          <div className={`flex items-center ${direction === 'rtl' ? 'flex-row-reverse' : ''} justify-between px-5 py-4`}>
            <Skeleton className="h-8 w-32" />
            <div className={`flex items-center ${direction === 'rtl' ? 'flex-row-reverse' : ''} gap-2.5`}>
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-9 w-20 rounded-md" />
            </div>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* Reciter Select Skeleton */}
          <div className={`flex flex-col gap-2.5 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
            <Skeleton className={`h-5 w-16 ${direction === 'rtl' ? 'text-right' : 'text-left'}`} />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>

          {/* Moshaf Select Skeleton */}
          <div className={`flex flex-col gap-2.5 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
            <Skeleton className={`h-5 w-24 ${direction === 'rtl' ? 'text-right' : 'text-left'}`} />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>

          {/* Surah Select Skeleton */}
          <div className={`flex flex-col gap-2.5 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
            <Skeleton className={`h-5 w-16 ${direction === 'rtl' ? 'text-right' : 'text-left'}`} />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>

          {/* Progress Bar Skeleton */}
          <div className="mt-6 p-5 bg-gradient-to-br from-card via-card to-muted/20 rounded-2xl border border-border/50 shadow-lg">
            <div className="mb-4">
              <Skeleton className="h-2 w-full rounded-full mb-2.5" />
              <div className="flex justify-between">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
            <div className="flex items-center justify-center gap-4">
              <Skeleton className="h-11 w-11 rounded-full" />
              <Skeleton className="h-20 w-20 rounded-full" />
              <Skeleton className="h-11 w-11 rounded-full" />
            </div>
          </div>

          {/* Current Surah Display Skeleton */}
          <div className="mt-4 p-4 rounded-lg bg-muted/50">
            <Skeleton className="h-4 w-24 mx-auto mb-2" />
            <Skeleton className="h-5 w-32 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir={direction} className={`w-[420px] min-h-[500px] bg-gradient-to-br from-background via-background to-muted/5 ${language === 'ar' ? 'font-arabic' : ''}`}>
      {/* Header with Language Switcher */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 border-b border-border/50 shadow-sm">
        <div className={`flex items-center ${direction === 'rtl' ? 'flex-row-reverse' : ''} justify-between px-5 py-4`}>
          <h1 className={`text-2xl font-bold ${direction === 'rtl' ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-primary via-primary to-primary/70 bg-clip-text text-transparent tracking-tight`}>
            {t.title}
          </h1>
          <div className={`flex items-center ${direction === 'rtl' ? 'flex-row-reverse' : ''} gap-2.5`}>
            <Languages className="h-4 w-4 text-muted-foreground" />
            <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
              <SelectTrigger className="w-20 h-9 bg-card/50 backdrop-blur-sm border-border/60 hover:border-border transition-all shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">EN</SelectItem>
                <SelectItem value="ar">AR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6">
      
      {/* Reciter Select */}
      <div className={`flex flex-col gap-3 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
        <label className={`text-sm font-semibold text-foreground/90 mb-0.5 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
          {t.reciter}
        </label>
        <Select
          value={selectedReciter?.id.toString() || ''}
          onValueChange={handleReciterChange}
        >
          <SelectTrigger className="h-12 bg-card/50 backdrop-blur-sm border-border/60 hover:border-border hover:bg-card transition-all shadow-sm" dir={direction}>
            <SelectValue placeholder={t.selectReciter} />
          </SelectTrigger>
          <SelectContent dir={direction}>
            {reciters.map((reciter) => (
              <SelectItem key={reciter.id} value={reciter.id.toString()} dir={direction}>
                {reciter.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Moshaf Select */}
      {selectedReciter && selectedReciter.moshaf && selectedReciter.moshaf.length > 0 && (
        <div className={`flex flex-col gap-3 animate-in fade-in-50 slide-in-from-top-2 duration-200 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
          <label className={`text-sm font-semibold text-foreground/90 mb-0.5 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
            {t.moshaf}
          </label>
          <Select
            value={selectedMoshaf?.id.toString() || ''}
            onValueChange={handleMoshafChange}
          >
            <SelectTrigger className="h-12 bg-card/50 backdrop-blur-sm border-border/60 hover:border-border hover:bg-card transition-all shadow-sm" dir={direction}>
              <SelectValue placeholder={t.selectMoshaf} />
            </SelectTrigger>
            <SelectContent dir={direction}>
              {selectedReciter.moshaf.map((moshaf) => (
                <SelectItem key={moshaf.id} value={moshaf.id.toString()} dir={direction}>
                  {moshaf.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Surah Select */}
      <div className={`flex flex-col gap-3 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
        <label className={`text-sm font-semibold text-foreground/90 mb-0.5 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
          {t.surah}
        </label>
        <Select
          value={selectedSurah?.id.toString() || ''}
          onValueChange={handleSurahChange}
        >
          <SelectTrigger className="h-12 bg-card/50 backdrop-blur-sm border-border/60 hover:border-border hover:bg-card transition-all shadow-sm" dir={direction}>
            <SelectValue placeholder={t.selectSurah} />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]" dir={direction}>
            {surahs.map((surah) => (
              <SelectItem key={surah.id} value={surah.id.toString()} dir={direction}>
                {surah.id}. {surah.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Audio Player Section */}
      <div className="mt-6 p-5 bg-gradient-to-br from-card via-card to-muted/20 rounded-2xl border border-border/50 shadow-lg backdrop-blur-sm">
        {/* Progress Bar */}
        <div className="mb-4">
          <div
            ref={progressRef}
            onClick={handleProgressClick}
            onMouseDown={handleProgressMouseDown}
            className="group relative h-2 bg-muted/50 rounded-full cursor-pointer overflow-hidden transition-all hover:h-2.5"
          >
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary via-primary to-primary/80 rounded-full transition-all duration-150 ease-out shadow-sm"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md border-2 border-background"
              style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 6px)` }}
            />
          </div>
          {/* Time Display */}
          <div className="flex justify-between items-center mt-2.5 text-xs text-muted-foreground font-medium">
            <span className="tabular-nums">{formatTime(currentTime)}</span>
            <span className="tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Audio Controls */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrevious}
            disabled={isLoadingAudio || currentSurahIndex === 0 || !selectedSurah}
            className="h-11 w-11 rounded-full hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            <SkipBack className="h-5 w-5" />
          </Button>
          
          <Button
            variant="default"
            size="icon"
            onClick={togglePlayPause}
            disabled={isLoading || isLoadingAudio || !selectedSurah || !selectedReciter || !selectedMoshaf}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-primary via-primary to-primary/90 hover:from-primary/90 hover:via-primary hover:to-primary shadow-xl hover:shadow-2xl transition-all scale-100 hover:scale-110 active:scale-105 disabled:opacity-50 disabled:scale-100 disabled:shadow-xl disabled:cursor-not-allowed"
          >
            {isPlaying ? (
              <Pause className="h-7 w-7" />
            ) : (
              <Play className="h-7 w-7 ml-1" />
            )}
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleNext}
            disabled={isLoadingAudio || currentSurahIndex === surahs.length - 1 || !selectedSurah}
            className="h-11 w-11 rounded-full hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            <SkipForward className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Current Surah Display */}
      {selectedSurah && (
        <div className={`mt-4 p-5 rounded-xl ${direction === 'rtl' ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-primary/10 via-primary/5 to-primary/10 border border-primary/20 shadow-sm backdrop-blur-sm ${direction === 'rtl' ? 'text-right' : 'text-center'}`}>
          <div className="text-xs font-semibold text-primary/70 mb-1.5 uppercase tracking-wide">{t.playing}</div>
          <div className={`text-lg font-bold text-foreground ${direction === 'rtl' ? 'text-right' : 'text-center'} bg-gradient-to-r ${direction === 'rtl' ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-foreground to-foreground/80 bg-clip-text text-transparent`}>
            {selectedSurah.name}
          </div>
        </div>
      )}
      </div>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} preload="none" />
    </div>
  );
}

export default App;

