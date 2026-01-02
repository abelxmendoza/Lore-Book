import { useState, useRef, useCallback } from 'react';

type RecordingState = 'idle' | 'recording' | 'paused' | 'processing';

export const useVoiceRecorder = () => {
  const [state, setState] = useState<RecordingState>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        setAudioBlob(blob);
        setState('idle');
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        setDuration(0);
        startTimeRef.current = null;
      };

      mediaRecorder.start();
      setState('recording');
      startTimeRef.current = Date.now();

      // Update duration every second
      durationIntervalRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      setState('idle');
      
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Microphone permission denied. Please allow microphone access.');
      } else if (err instanceof Error && err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone.');
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop();
      setState('processing');
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, [state]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.pause();
      setState('paused');
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  }, [state]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'paused') {
      mediaRecorderRef.current.resume();
      setState('recording');
      startTimeRef.current = Date.now() - (duration * 1000);
      durationIntervalRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    }
  }, [state, duration]);

  const reset = useCallback(() => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setState('idle');
    setAudioBlob(null);
    setError(null);
    setDuration(0);
    chunksRef.current = [];
    startTimeRef.current = null;
  }, [state]);

  const getAudioFile = useCallback((): File | null => {
    if (!audioBlob) return null;
    
    const file = new File([audioBlob], `voice-memo-${Date.now()}.webm`, {
      type: audioBlob.type || 'audio/webm'
    });
    return file;
  }, [audioBlob]);

  return {
    state,
    isRecording: state === 'recording',
    isPaused: state === 'paused',
    isProcessing: state === 'processing',
    audioBlob,
    error,
    duration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    reset,
    getAudioFile
  };
};

