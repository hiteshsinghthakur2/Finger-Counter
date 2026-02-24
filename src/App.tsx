import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Camera, StopCircle, Hand, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

let aiClient: GoogleGenAI | null = null;

const getAiClient = () => {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'undefined') {
      throw new Error('GEMINI_API_KEY is not set');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [fingerCount, setFingerCount] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  
  const streamRef = useRef<MediaStream | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startCamera = async () => {
    setError(null);
    setFingerCount(null);
    setCapturedImage(null);
    setCountdown(3);
    
    // Check API key before starting camera
    try {
      getAiClient();
    } catch (err) {
      setError('Gemini API key is missing. Please add GEMINI_API_KEY to your Vercel environment variables and redeploy.');
      setCountdown(null);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setIsCameraActive(true);
      
      // Start countdown
      let currentCount = 3;
      countdownIntervalRef.current = setInterval(() => {
        currentCount -= 1;
        if (currentCount > 0) {
          setCountdown(currentCount);
        } else {
          setCountdown(null);
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          captureAndProcess();
        }
      }, 1000);

    } catch (err: any) {
      console.error('Error accessing camera:', err);
      setError('Could not access the camera. Please ensure you have granted permission.');
      setCountdown(null);
    }
  };

  const stopCamera = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setCountdown(null);
  };

  const captureAndProcess = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsProcessing(true);
    
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const base64ImageUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(base64ImageUrl);
        stopCamera(); // Stop live feed, show captured image
        
        const base64Data = base64ImageUrl.split(',')[1];
        
        const ai = getAiClient();
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Data
                }
              },
              {
                text: 'Analyze this image and count the number of fingers held up. Return ONLY a single digit number (e.g., 0, 1, 2, 3, 4, 5). If no hand is clearly visible, return 0.'
              }
            ]
          }
        });
        
        const text = response.text?.trim();
        if (text && /^\d+$/.test(text)) {
          setFingerCount(text);
        } else {
          setFingerCount('?');
        }
      }
    } catch (err) {
      console.error('Error processing frame:', err);
      setError('Failed to analyze the image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4 md:p-8 font-sans">
      <div className="max-w-4xl w-full flex flex-col gap-8">
        <header className="text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight flex items-center justify-center gap-3">
            <Hand className="w-10 h-10 text-emerald-400" />
            Finger Counter
          </h1>
          <p className="text-neutral-400 text-lg max-w-xl mx-auto">
            Show your hand to the camera. It will take a photo in 3 seconds and count your fingers.
          </p>
        </header>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="relative aspect-video bg-neutral-900 rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl ring-1 ring-white/10">
          {!isCameraActive && !capturedImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 space-y-4">
              <Camera className="w-16 h-16 opacity-50" />
              <p className="text-lg font-medium">Camera is off</p>
            </div>
          )}
          
          {capturedImage ? (
            <img 
              src={capturedImage} 
              alt="Captured frame" 
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-500 ${isCameraActive ? 'opacity-100' : 'opacity-0'}`}
              style={{ transform: 'scaleX(-1)' }}
            />
          )}
          
          <canvas ref={canvasRef} className="hidden" />

          <AnimatePresence>
            {countdown !== null && (
              <motion.div
                key={countdown}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0 flex items-center justify-center z-10"
              >
                <span className="text-9xl font-bold text-white drop-shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                  {countdown}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {capturedImage && fingerCount !== null && (
              <motion.div
                key={fingerCount}
                initial={{ scale: 0.8, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.8, opacity: 0, y: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="absolute top-6 right-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center min-w-[140px] shadow-2xl"
              >
                <span className="text-xs text-neutral-400 font-semibold uppercase tracking-widest mb-1">Count</span>
                <span className="text-7xl font-bold text-white tabular-nums leading-none tracking-tighter">
                  {fingerCount}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {isProcessing && (
            <div className="absolute bottom-6 left-6 flex items-center gap-3 bg-black/60 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-neutral-300">
                Analyzing photo...
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-4">
          {!isCameraActive && !capturedImage && !isProcessing && (
            <button
              onClick={startCamera}
              className="group flex items-center gap-3 bg-white text-black px-8 py-4 rounded-full font-semibold text-lg hover:bg-neutral-200 transition-all active:scale-95 shadow-xl shadow-white/10"
            >
              <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" />
              Start Camera
            </button>
          )}
          
          {isCameraActive && (
            <button
              onClick={stopCamera}
              className="group flex items-center gap-3 bg-red-500/10 text-red-500 border border-red-500/20 px-8 py-4 rounded-full font-semibold text-lg hover:bg-red-500/20 transition-all active:scale-95"
            >
              <StopCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
              Cancel
            </button>
          )}

          {capturedImage && !isProcessing && (
            <button
              onClick={startCamera}
              className="group flex items-center gap-3 bg-white text-black px-8 py-4 rounded-full font-semibold text-lg hover:bg-neutral-200 transition-all active:scale-95 shadow-xl shadow-white/10"
            >
              <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
