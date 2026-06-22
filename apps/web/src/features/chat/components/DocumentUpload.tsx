import React, { useState, useRef } from 'react';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2, Image as ImageIcon, Briefcase } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { PhotoUploadReview } from './PhotoUploadReview';
import { MessageScreenshotUpload } from './MessageScreenshotUpload';
import {
  DEMO_RESUME_UPLOAD_STAGES,
  shouldSimulateResumeUpload,
  simulateDemoResumeUpload,
  type DemoResumeUploadProgress,
} from '../../../services/demoResumeUpload';
import {
  DEMO_PHOTO_ANALYZE_STAGES,
  DEMO_PHOTO_PROCESS_STAGES,
  shouldSimulatePhotoUpload,
  simulateDemoPhotoAnalyze,
  simulateDemoPhotoProcess,
} from '../../../services/demoPhotoUpload';
import {
  DEMO_DOCUMENT_UPLOAD_STAGES,
  shouldSimulateDocumentUpload,
  simulateDemoDocumentUpload,
} from '../../../services/demoDocumentUpload';

export type ResumeUploadResult = {
  kind: 'resume';
  fileName: string;
  chatFeedback: string;
  userFileId?: string;
  claimsCreated?: number;
  momentsCreated?: number;
  eventsCreated?: number;
};

export type DocumentUploadResult = {
  kind: 'document';
  fileName: string;
  message: string;
  entriesCreated?: number;
};

export type UploadCompletePayload = ResumeUploadResult | DocumentUploadResult;

interface DocumentUploadProps {
  onUploadComplete?: (result: UploadCompletePayload) => void;
  onUploadError?: (error: string) => void;
  compact?: boolean;
  /** When chat is focused on a character, message screenshots route there. */
  focusCharacterId?: string;
  focusCharacterName?: string;
}

interface PhotoReviewState {
  file: File;
  analysis: any;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  onUploadComplete,
  onUploadError,
  compact = false,
  focusCharacterId,
  focusCharacterName,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [resumeUploadProgress, setResumeUploadProgress] = useState<DemoResumeUploadProgress | null>(null);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<DemoUploadProgress | null>(null);
  const [photoProcessProgress, setPhotoProcessProgress] = useState<DemoUploadProgress | null>(null);
  const [documentUploadProgress, setDocumentUploadProgress] = useState<DemoUploadProgress | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    entriesCreated?: number;
    charactersCreated?: number;
    sectionsCreated?: number;
  } | null>(null);
  const [photoReview, setPhotoReview] = useState<PhotoReviewState | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's an image
    if (file.type.startsWith('image/')) {
      await handlePhotoUpload(file);
      return;
    }

    const fileName = file.name.toLowerCase();
    const fileExtension = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
    const allowedExtensions = ['.txt', '.md', '.pdf', '.doc', '.docx'];

    // In chat (compact), PDF/DOC/DOCX uploads are treated as resumes
    const isResume =
      fileName.includes('resume') ||
      fileName.includes('cv') ||
      fileName.includes('curriculum') ||
      (compact && (fileExtension === '.pdf' || fileExtension === '.docx' || fileExtension === '.doc'));

    // Validate file type for documents
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (
      !allowedTypes.includes(file.type) &&
      !allowedExtensions.includes(fileExtension)
    ) {
      const error = 'Invalid file type. Only .txt, .md, .pdf, .doc, .docx, or image files are allowed.';
      setUploadResult({ success: false, message: error });
      onUploadError?.(error);
      return;
    }

    // Validate file size (10MB limit for documents, 5MB for resumes)
    const maxSize = isResume ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      const error = isResume 
        ? 'Resume file size exceeds 5MB limit.'
        : 'File size exceeds 10MB limit.';
      setUploadResult({ success: false, message: error });
      onUploadError?.(error);
      return;
    }

    // Route to resume upload if it's a resume
    if (isResume) {
      await uploadResume(file);
      return;
    }

    await uploadFile(file);
  };

  const handlePhotoUpload = async (file: File) => {
    setProcessingPhoto(true);
    setPhotoUploadProgress(null);
    setUploadProgress('Analyzing photo...');

    try {
      if (shouldSimulatePhotoUpload()) {
        const analysis = await simulateDemoPhotoAnalyze(file, (progress) => {
          setPhotoUploadProgress(progress);
          setUploadProgress(progress.stageLabel);
        });
        setPhotoReview({ file, analysis });
        setUploadProgress(null);
        setPhotoUploadProgress(null);
        return;
      }

      const { supabase } = await import('../../../lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      // Upload photo file directly (not base64)
      const formData = new FormData();
      formData.append('photo', file);

      // Analyze photo
      const response = await fetch('/api/photos/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to analyze photo');
      }

      const analysis = await response.json();
      setPhotoReview({ file, analysis });
      setUploadProgress(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to analyze photo';
      setUploadResult({ success: false, message: errorMessage });
      onUploadError?.(errorMessage);
    } finally {
      setProcessingPhoto(false);
      setPhotoUploadProgress(null);
    }
  };

  const handlePhotoApprove = async (options: {
    addToLoreBook: boolean;
    extractTextOnly: boolean;
    suggestedLocation?: any;
  }) => {
    if (!photoReview) return;

    setProcessingPhoto(true);
    setPhotoProcessProgress(null);
    setUploadProgress('Processing photo...');

    try {
      if (shouldSimulatePhotoUpload()) {
        const result = await simulateDemoPhotoProcess(
          photoReview.file,
          options,
          (progress) => {
            setPhotoProcessProgress(progress);
            setUploadProgress(progress.stageLabel);
          },
        );
        setUploadResult({
          success: true,
          message: result.message,
        });
        setPhotoReview(null);
        setUploadProgress(null);
        setPhotoProcessProgress(null);
        onUploadComplete?.();

        setTimeout(() => {
          setUploadResult(null);
        }, 5000);
        return;
      }

      const { supabase } = await import('../../../lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      // Convert file to base64
      const arrayBuffer = await photoReview.file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      const formData = new FormData();
      formData.append('photo', photoReview.file);
      formData.append('options', JSON.stringify(options));

      const response = await fetch('/api/photos/process', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to process photo');
      }

      const result = await response.json();
      setUploadResult({
        success: true,
        message: options.extractTextOnly
          ? 'Text extracted successfully'
          : 'Photo added to lore book'
      });
      setPhotoReview(null);
      setUploadProgress(null);
      onUploadComplete?.();

      // Auto-hide success message
      setTimeout(() => {
        setUploadResult(null);
      }, 5000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process photo';
      setUploadResult({ success: false, message: errorMessage });
      onUploadError?.(errorMessage);
    } finally {
      setProcessingPhoto(false);
      setPhotoProcessProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePhotoReject = () => {
    setPhotoReview(null);
    setUploadProgress(null);
    setPhotoUploadProgress(null);
    setPhotoProcessProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadResume = async (file: File) => {
    setIsUploading(true);
    setUploadProgress('Processing resume...');
    setResumeUploadProgress(null);
    setUploadResult(null);

    const finishSuccess = (result: ResumeUploadResult, entriesCreated?: number) => {
      setUploadResult({
        success: true,
        message: 'Resume saved to library and memory.',
        entriesCreated: entriesCreated ?? result.momentsCreated ?? result.claimsCreated,
      });
      setUploadProgress(null);
      setResumeUploadProgress(null);
      onUploadComplete?.(result);
      window.dispatchEvent(new Event('lk:characters-updated'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setUploadResult(null), 5000);
    };

    try {
      if (shouldSimulateResumeUpload()) {
        const result = await simulateDemoResumeUpload(file, (progress) => {
          setResumeUploadProgress(progress);
          setUploadProgress(progress.stageLabel);
        });
        finishSuccess(result);
        return;
      }

      // Get auth token
      const { supabase } = await import('../../../lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      if (!token) {
        throw new Error('Authentication required. Please log in to upload your resume.');
      }

      setUploadProgress('Saving to library and building your timelines...');

      const formData = new FormData();
      formData.append('resume', file);

      const response = await fetch('/api/resume/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to process resume');
      }

      const data = await response.json();

      const feedbackText =
        typeof data.chatFeedback === 'string' && data.chatFeedback.trim()
          ? data.chatFeedback
          : data.message || `Resume processed! ${data.claimsCreated ?? 0} claims added to your lore.`;

      finishSuccess({
        kind: 'resume',
        fileName: file.name,
        chatFeedback: feedbackText,
        userFileId: data.userFileId,
        claimsCreated: data.claimsCreated,
        momentsCreated: data.momentsCreated,
        eventsCreated: data.eventsCreated,
      }, data.momentsCreated ?? data.claimsCreated);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload resume';
      setUploadResult({ success: false, message: errorMessage });
      setUploadProgress(null);
      setResumeUploadProgress(null);
      onUploadError?.(errorMessage);

      // Clear file input on error
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setIsUploading(false);
    }
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadProgress('Preparing upload...');
    setDocumentUploadProgress(null);
    setUploadResult(null);

    try {
      if (shouldSimulateDocumentUpload()) {
        const result = await simulateDemoDocumentUpload(file, (progress) => {
          setDocumentUploadProgress(progress);
          setUploadProgress(progress.stageLabel);
        });

        setUploadResult({
          success: true,
          message: 'Document processed successfully!',
          entriesCreated: result.entriesCreated,
        });
        setUploadProgress(null);
        setDocumentUploadProgress(null);
        onUploadComplete?.(result);

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        setTimeout(() => {
          setUploadResult(null);
        }, 5000);
        return;
      }

      // Get auth token
      const { supabase } = await import('../../../lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      setUploadProgress('Uploading document...');

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Upload failed');
      }

      setUploadProgress('Processing document...');

      const data = await response.json();

      setUploadResult({
        success: true,
        message: data.message || 'Document processed successfully!',
        entriesCreated: data.entriesCreated,
        charactersCreated: data.charactersCreated,
        sectionsCreated: data.sectionsCreated
      });

      setUploadProgress(null);
      onUploadComplete?.({
        kind: 'document',
        fileName: file.name,
        message: data.message || 'Document processed successfully!',
        entriesCreated: data.entriesCreated,
      });

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Auto-hide success message after 5 seconds
      setTimeout(() => {
        setUploadResult(null);
      }, 5000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload document';
      setUploadResult({ success: false, message: errorMessage });
      setUploadProgress(null);
      setDocumentUploadProgress(null);
      onUploadError?.(errorMessage);

      // Clear file input on error
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setIsUploading(false);
      setDocumentUploadProgress(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (file) {
      // Check if it's an image
      if (file.type.startsWith('image/')) {
        handlePhotoUpload(file);
        return;
      }

      const fileName = file.name.toLowerCase();
      const fileExtension = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
      const isResume =
        fileName.includes('resume') ||
        fileName.includes('cv') ||
        fileName.includes('curriculum') ||
        (compact && (fileExtension === '.pdf' || fileExtension === '.docx' || fileExtension === '.doc'));

      if (isResume) {
        uploadResume(file);
      } else {
        uploadFile(file);
      }
    }
  };

  // Show photo review if analyzing
  if (photoReview) {
    return (
      <PhotoUploadReview
        photo={photoReview.file}
        analysis={photoReview.analysis}
        onApprove={handlePhotoApprove}
        onReject={handlePhotoReject}
        loading={processingPhoto}
        processProgress={photoProcessProgress}
        processStages={DEMO_PHOTO_PROCESS_STAGES}
      />
    );
  }

  return (
    <div className={`space-y-3 ${compact ? 'space-y-2' : ''}`}>
      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
          className={`
          relative border-2 border-dashed rounded-lg transition-colors
          ${compact ? 'p-3' : 'p-6'}
          ${isUploading || processingPhoto
            ? 'border-primary/50 bg-primary/5' 
            : 'border-border/60 bg-black/20 hover:border-primary/40 hover:bg-black/30'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf,.doc,.docx,image/*"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading || processingPhoto}
        />

        <div className="flex flex-col items-center justify-center text-center">
          {isUploading || processingPhoto ? (
            resumeUploadProgress ? (
              <DemoUploadProgressPanel
                progress={resumeUploadProgress}
                stages={DEMO_RESUME_UPLOAD_STAGES}
                icon={Briefcase}
                compact={compact}
              />
            ) : photoUploadProgress ? (
              <DemoUploadProgressPanel
                progress={photoUploadProgress}
                stages={DEMO_PHOTO_ANALYZE_STAGES}
                icon={ImageIcon}
                compact={compact}
              />
            ) : documentUploadProgress ? (
              <DemoUploadProgressPanel
                progress={documentUploadProgress}
                stages={DEMO_DOCUMENT_UPLOAD_STAGES}
                icon={FileText}
                compact={compact}
              />
            ) : (
              <>
                <Loader2 className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} text-primary animate-spin mb-2`} />
                <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-white mb-1`}>
                  {uploadProgress || 'Uploading...'}
                </p>
                {!compact && (
                  <p className="text-xs text-white/60">
                    Processing your document...
                  </p>
                )}
              </>
            )
          ) : (
            <>
              <div className={`${compact ? 'p-2' : 'p-3'} bg-primary/10 rounded-lg ${compact ? 'mb-2' : 'mb-3'}`}>
                <Upload className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} text-primary`} />
              </div>
              <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-white ${compact ? 'mb-1' : 'mb-1'}`}>
                {compact ? 'Upload Documents, Resumes, or Photos' : 'Upload Documents, Resumes, Photos, Biographies, or Diaries'}
              </p>
              {!compact && (
                <p className="text-xs text-white/60 mb-4">
                  Drag and drop a file here, or click to browse
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size={compact ? "sm" : "sm"}
                  leftIcon={<FileText className="w-4 h-4" />}
                  className="border-primary/40 hover:bg-primary/10"
                >
                  Documents
                </Button>
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size={compact ? "sm" : "sm"}
                  leftIcon={<ImageIcon className="w-4 h-4" />}
                  className="border-primary/40 hover:bg-primary/10"
                >
                  Photos
                </Button>
              </div>
              {!compact && (
                <p className="text-xs text-white/40 mt-3">
                  Supported: .txt, .md, .pdf, .doc, .docx, images (max 10MB)<br />
                  <span className="text-primary/70">✨ Resumes/CVs are automatically detected and extract skills & experience</span>
                </p>
              )}
              {compact && (
                <div className="mt-3 w-full">
                  <MessageScreenshotUpload
                    characterId={focusCharacterId}
                    characterName={focusCharacterName}
                    onComplete={() => onUploadComplete?.()}
                    onError={onUploadError}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div
          className={`
            flex items-start gap-3 rounded-lg border
            ${compact ? 'p-2' : 'p-4'}
            ${uploadResult.success
              ? 'bg-primary/10 border-primary/30'
              : 'bg-red-500/10 border-red-500/30'
            }
          `}
        >
          {uploadResult.success ? (
            <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium ${
                uploadResult.success ? 'text-white' : 'text-red-400'
              }`}
            >
              {uploadResult.message}
            </p>
            {uploadResult.success && (
              <div className="mt-2 space-y-1 text-xs text-white/70">
                {uploadResult.entriesCreated !== undefined && (
                  <p>• Created {uploadResult.entriesCreated} journal entries</p>
                )}
                {uploadResult.charactersCreated !== undefined && (
                  <p>• Detected {uploadResult.charactersCreated} characters</p>
                )}
                {uploadResult.sectionsCreated !== undefined && (
                  <p>• Created {uploadResult.sectionsCreated} memoir sections</p>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setUploadResult(null)}
            className="text-white/40 hover:text-white/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
