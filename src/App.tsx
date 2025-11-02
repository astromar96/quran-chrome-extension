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
  const audioRef = useRef<HTMLAudioElement>(null);

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
  const handleReciterChange = (reciterId: string) => {
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
          loadAudio(firstMoshaf, selectedSurah);
        }
      }
    } else {
      console.error('Reciter not found with id:', reciterId);
    }
  };

  // Handle moshaf selection
  const handleMoshafChange = (moshafId: string) => {
    if (!selectedReciter) return;
    
    const moshaf = selectedReciter.moshaf.find(m => m.id === parseInt(moshafId));
    if (moshaf) {
      setSelectedMoshaf(moshaf);
      if (selectedSurah) {
        savePreferences(selectedReciter.id, moshaf.id, selectedSurah.id);
        loadAudio(moshaf, selectedSurah);
      }
    }
  };

  // Handle surah selection
  const handleSurahChange = (surahId: string) => {
    const surah = surahs.find(s => s.id === parseInt(surahId));
    if (surah && selectedReciter && selectedMoshaf) {
      setSelectedSurah(surah);
      setCurrentSurahIndex(surahs.findIndex(s => s.id === surah.id));
      savePreferences(selectedReciter.id, selectedMoshaf.id, surah.id);
      loadAudio(selectedMoshaf, surah);
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
      return;
    }

    // Validate that server URL exists
    if (!moshaf.server) {
      console.error('Moshaf missing server URL:', moshaf);
      alert('Selected moshaf is missing server URL. Please select a different moshaf.');
      return;
    }

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
  };

  // Navigate to next surah
  const handleNext = () => {
    if (currentSurahIndex < surahs.length - 1 && selectedReciter && selectedMoshaf) {
      const nextSurah = surahs[currentSurahIndex + 1];
      setCurrentSurahIndex(currentSurahIndex + 1);
      setSelectedSurah(nextSurah);
      savePreferences(selectedReciter.id, selectedMoshaf.id, nextSurah.id);
      loadAudio(selectedMoshaf, nextSurah);
    }
  };

  // Navigate to previous surah
  const handlePrevious = () => {
    if (currentSurahIndex > 0 && selectedReciter && selectedMoshaf) {
      const prevSurah = surahs[currentSurahIndex - 1];
      setCurrentSurahIndex(currentSurahIndex - 1);
      setSelectedSurah(prevSurah);
      savePreferences(selectedReciter.id, selectedMoshaf.id, prevSurah.id);
      loadAudio(selectedMoshaf, prevSurah);
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

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      // Auto-play next surah if available
      if (currentSurahIndex < surahs.length - 1 && selectedReciter && selectedMoshaf) {
        const nextSurah = surahs[currentSurahIndex + 1];
        setCurrentSurahIndex(currentSurahIndex + 1);
        setSelectedSurah(nextSurah);
        savePreferences(selectedReciter.id, selectedMoshaf.id, nextSurah.id);
        loadAudio(selectedMoshaf, nextSurah);
      }
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [selectedSurah, selectedReciter, selectedMoshaf, currentSurahIndex, surahs]);

  // Load audio when surah or moshaf changes
  useEffect(() => {
    if (selectedSurah && selectedMoshaf) {
      loadAudio(selectedMoshaf, selectedSurah);
    }
  }, [selectedSurah, selectedMoshaf]);

  if (isLoading) {
    return (
      <div className={`w-[420px] min-h-[500px] bg-gradient-to-br from-background via-background to-muted/10 ${language === 'ar' ? 'font-arabic' : ''}`}>
        {/* Header Skeleton */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40">
          <div className={`flex items-center ${language === 'ar' ? 'flex-row-reverse' : ''} justify-between p-4`}>
            <Skeleton className="h-8 w-32" />
            <div className={`flex items-center ${language === 'ar' ? 'flex-row-reverse' : ''} gap-2`}>
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Reciter Select Skeleton */}
          <div className={`flex flex-col gap-2.5 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            <Skeleton className={`h-5 w-16 ${language === 'ar' ? 'ml-auto' : 'mr-auto'}`} />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>

          {/* Moshaf Select Skeleton */}
          <div className={`flex flex-col gap-2.5 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            <Skeleton className={`h-5 w-24 ${language === 'ar' ? 'ml-auto' : 'mr-auto'}`} />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>

          {/* Surah Select Skeleton */}
          <div className={`flex flex-col gap-2.5 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            <Skeleton className={`h-5 w-16 ${language === 'ar' ? 'ml-auto' : 'mr-auto'}`} />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>

          {/* Audio Controls Skeleton */}
          <div className="flex items-center justify-center gap-3 mt-2">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
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
    <div dir={language} className={`w-[420px] min-h-[500px] bg-gradient-to-br from-background via-background to-muted/10 ${language === 'ar' ? 'font-arabic' : ''}`}>
      {/* Header with Language Switcher */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40">
        <div className={`flex items-center ${language === 'ar' ? 'flex-row-reverse' : ''} justify-between p-4`}>
          <h1 className={`text-2xl font-bold ${language === 'ar' ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-primary to-primary/60 bg-clip-text text-transparent`}>
            {t.title}
          </h1>
          <div className={`flex items-center ${language === 'ar' ? 'flex-row-reverse' : ''} gap-2`}>
            <Languages className="h-4 w-4 text-muted-foreground" />
            <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
              <SelectTrigger className="w-20 h-8">
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

      <div className="p-5 flex flex-col gap-5">
      
      {/* Reciter Select */}
      <div className={`flex flex-col gap-2.5 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
        <label className={`text-sm font-semibold text-foreground/90 ${language === 'ar' ? 'ml-auto' : 'mr-auto'}`}>
          {t.reciter}
        </label>
        <Select
          value={selectedReciter?.id.toString() || ''}
          onValueChange={handleReciterChange}
        >
          <SelectTrigger className="h-11 bg-card border-border/50 hover:border-border transition-colors" dir={direction}>
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
        <div className={`flex flex-col gap-2.5 animate-in fade-in-50 slide-in-from-top-2 duration-200 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
          <label className={`text-sm font-semibold text-foreground/90 ${language === 'ar' ? 'ml-auto' : 'mr-auto'}`}>
            {t.moshaf}
          </label>
          <Select
            value={selectedMoshaf?.id.toString() || ''}
            onValueChange={handleMoshafChange}
          >
            <SelectTrigger className="h-11 bg-card border-border/50 hover:border-border transition-colors" dir={direction}>
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
      <div className={`flex flex-col gap-2.5 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
        <label className={`text-sm font-semibold text-foreground/90 ${language === 'ar' ? 'ml-auto' : 'mr-auto'}`}>
          {t.surah}
        </label>
        <Select
          value={selectedSurah?.id.toString() || ''}
          onValueChange={handleSurahChange}
        >
          <SelectTrigger className="h-11 bg-card border-border/50 hover:border-border transition-colors" dir={direction}>
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

      {/* Audio Controls */}
      <div className="flex items-center justify-center gap-3 mt-2">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePrevious}
          disabled={currentSurahIndex === 0 || !selectedSurah}
          className="h-10 w-10 rounded-full hover:bg-primary/10 hover:border-primary/50 transition-all disabled:opacity-40"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        
        <Button
          variant="default"
          size="icon"
          onClick={togglePlayPause}
          disabled={!selectedSurah || !selectedReciter || !selectedMoshaf}
          className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all scale-100 hover:scale-105 disabled:opacity-50 disabled:scale-100"
        >
          {isPlaying ? (
            <Pause className="h-6 w-6" />
          ) : (
            <Play className="h-6 w-6 ml-0.5" />
          )}
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={handleNext}
          disabled={currentSurahIndex === surahs.length - 1 || !selectedSurah}
          className="h-10 w-10 rounded-full hover:bg-primary/10 hover:border-primary/50 transition-all disabled:opacity-40"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      {/* Current Surah Display */}
      {selectedSurah && (
        <div className={`mt-4 p-4 rounded-lg ${language === 'ar' ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-primary/5 to-primary/10 border border-primary/20 ${language === 'ar' ? 'text-right' : 'text-center'}`}>
          <div className="text-xs font-medium text-muted-foreground mb-1">{t.playing}</div>
          <div className={`text-base font-semibold text-foreground ${language === 'ar' ? 'text-right' : 'text-center'}`}>
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

