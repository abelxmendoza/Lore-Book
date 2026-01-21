import type { ContentType } from '../types';

export type ContentTypeDetection = {
  type: ContentType;
  preserveOriginal: boolean;
  confidence: number;
};

/**
 * Detects content type and whether original language should be preserved
 * Returns detection result with confidence score
 */
export function detectContentType(text: string): ContentTypeDetection {
  const lower = text.toLowerCase().trim();
  const textLength = text.length;

  // Messages to readers - high confidence patterns
  const messageToReaderPatterns = [
    /\b(dear reader|to the reader|if you['']re reading|to those who|for anyone who|to my readers|dear future self|if you are reading this|to whoever reads this)\b/i,
    /^(dear|to|for)\s+(reader|readers|you|those|anyone)/i,
  ];
  if (messageToReaderPatterns.some(p => p.test(text))) {
    return { type: 'message_to_reader', preserveOriginal: true, confidence: 0.9 };
  }

  // Testimonies - personal statements, explanations of purpose
  const testimonyPatterns = [
    /\b(why i wrote|my testimony|i want to share|i wrote this because|this is why|the reason i|my story is|i['']m sharing this|why this matters|the purpose of|i created this because)\b/i,
    /^(this is|i am|i['']m)\s+(my|a)\s+(testimony|story|reason|explanation)/i,
  ];
  if (testimonyPatterns.some(p => p.test(text))) {
    return { type: 'testimony', preserveOriginal: true, confidence: 0.85 };
  }

  // Advice - direct guidance, wisdom
  const advicePatterns = [
    /\b(i advise|remember to|don['']t forget|to anyone|if i could tell|what i learned|my advice|take it from me|trust me when|i would tell|if you|you should know|learn from this)\b/i,
    /^(advice|remember|don['']t forget|to anyone)/i,
  ];
  if (advicePatterns.some(p => p.test(text)) && textLength > 50) {
    return { type: 'advice', preserveOriginal: true, confidence: 0.8 };
  }

  // Dedications - short, personal dedications
  const dedicationPatterns = [
    /\b(i dedicate|dedicated to|to my|for my|in memory of|this is for|in honor of)\b/i,
    /^(to|for|dedicated to)\s+(my|the)/i,
  ];
  if (dedicationPatterns.some(p => p.test(text)) && textLength < 500) {
    return { type: 'dedication', preserveOriginal: true, confidence: 0.85 };
  }

  // Acknowledgments
  if (/\b(acknowledgment|acknowledgement|i would like to thank|special thanks|gratitude|i am grateful)\b/i.test(text) && textLength < 1000) {
    return { type: 'acknowledgment', preserveOriginal: true, confidence: 0.8 };
  }

  // Prefaces - opening statements in books
  if (/\b(preface|foreword|introduction|prologue|opening note|before we begin)\b/i.test(text) && textLength > 200) {
    return { type: 'preface', preserveOriginal: true, confidence: 0.75 };
  }

  // Epilogues - closing statements
  if (/\b(epilogue|afterword|closing note|final thoughts|in closing|to conclude)\b/i.test(text) && textLength > 200) {
    return { type: 'epilogue', preserveOriginal: true, confidence: 0.75 };
  }

  // Manifestos - declarations of intent, principles
  const manifestoPatterns = [
    /\b(manifesto|i declare|i stand for|my principles|i believe in|this is what|i am committed to)\b/i,
    /^(i|we)\s+(declare|stand|believe|commit)/i,
  ];
  if (manifestoPatterns.some(p => p.test(text)) && textLength > 100) {
    return { type: 'manifesto', preserveOriginal: true, confidence: 0.8 };
  }

  // Vows - commitments, promises
  const vowPatterns = [
    /\b(i vow|i promise|i swear|i commit|i pledge|i give my word|i make this promise)\b/i,
    /^(i|we)\s+(vow|promise|swear|commit|pledge)/i,
  ];
  if (vowPatterns.some(p => p.test(text))) {
    return { type: 'vow', preserveOriginal: true, confidence: 0.85 };
  }

  // Promises - similar to vows but more casual
  if (/\b(i promise|i make this promise|my promise|i give you my word)\b/i.test(text) && !vowPatterns.some(p => p.test(text))) {
    return { type: 'promise', preserveOriginal: true, confidence: 0.8 };
  }

  // Declarations - formal statements
  if (/\b(i declare|i state|i affirm|i proclaim|this is my declaration)\b/i.test(text) && textLength > 50) {
    return { type: 'declaration', preserveOriginal: true, confidence: 0.75 };
  }

  // Default: standard content
  return { type: 'standard', preserveOriginal: false, confidence: 1.0 };
}

/**
 * Checks if content type requires original language preservation
 */
export function requiresOriginalPreservation(contentType: ContentType): boolean {
  return contentType !== 'standard';
}
