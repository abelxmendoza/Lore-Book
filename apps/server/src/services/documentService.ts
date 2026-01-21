import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';
import { characterAvatarUrl, avatarStyleFor } from '../utils/avatar';
import { cacheAvatar } from '../utils/cacheAvatar';
import { detectContentType } from '../utils/contentTypeDetection';

import { memoirService } from './memoirService';
import { memoryService } from './memoryService';
import { peoplePlacesService } from './peoplePlacesService';
import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

type DocumentAnalysis = {
  entries: Array<{ 
    content: string; 
    date: string; 
    tags?: string[];
    content_type?: string;
    preserve_original_language?: boolean;
    original_content?: string;
  }>;
  characters: Array<{ name: string; description?: string; relationships?: string[] }>;
  memoirSections: Array<{ title: string; content: string; period?: { from: string; to: string } }>;
  languageStyle: string;
  keyThemes: string[];
};

class DocumentService {
  async processDocument(
    userId: string,
    fileContent: string,
    fileName: string,
    fileType: string
  ): Promise<{ success: boolean; entriesCreated: number; charactersCreated: number; sectionsCreated: number }> {
    try {
      // Extract text from document (handle different formats)
      const text = await this.extractText(fileContent, fileType);

      // Analyze document with AI
      const analysis = await this.analyzeDocument(text, fileName);

      // Store original document for reference
      await this.storeOriginalDocument(userId, text, fileName, analysis.languageStyle);

      // Create entries from document
      const entriesCreated = await this.createEntriesFromDocument(userId, analysis.entries);

      // Create characters from document
      const charactersCreated = await this.createCharactersFromDocument(userId, analysis.characters);

      // Create memoir sections from document
      const sectionsCreated = await this.createMemoirSectionsFromDocument(userId, analysis.memoirSections, analysis.languageStyle);

      return {
        success: true,
        entriesCreated,
        charactersCreated,
        sectionsCreated
      };
    } catch (error) {
      logger.error({ error }, 'Failed to process document');
      throw error;
    }
  }

  private async extractText(content: string, fileType: string): Promise<string> {
    // For now, handle plain text and base64 encoded files
    // In production, you'd want to use libraries like pdf-parse, mammoth (for DOCX), etc.
    
    if (fileType === 'text/plain' || fileType === 'text/markdown') {
      return content;
    }

    // If it's base64 encoded, decode it
    if (content.startsWith('data:')) {
      const base64Data = content.split(',')[1];
      const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
      return decoded;
    }

    return content;
  }

  private async analyzeDocument(text: string, fileName: string): Promise<DocumentAnalysis> {
    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `You are analyzing a personal document (memoir, journal, autobiography, diary, biography, etc.) to extract structured information.

CRITICAL: Detect and preserve special content types that require original language preservation:
- Testimonies: Personal statements, "why I wrote this", explanations of purpose, personal stories
- Advice: Direct advice, wisdom, guidance to readers ("remember to", "don't forget", "if I could tell you")
- Messages to Readers: Direct addresses like "Dear reader", "To those who...", "If you're reading this", "Dear future self"
- Dedications: Book dedications, acknowledgments ("I dedicate", "To my", "For my")
- Prefaces/Epilogues: Opening/closing statements in books
- Manifestos: Personal declarations, statements of intent, principles
- Vows/Promises: Commitments, promises, vows ("I vow", "I promise", "I declare")
- Declarations: Formal personal statements

For these content types:
1. Mark with content_type field (one of: testimony, advice, message_to_reader, dedication, acknowledgment, preface, epilogue, manifesto, vow, promise, declaration)
2. Set preserve_original_language: true
3. Store EXACT original wording in original_content field (same as content if unchanged)

Extract:
1. Journal entries with dates (if available) or infer chronological order
2. Characters/people mentioned with descriptions and relationships
3. Memoir sections (if it's a memoir) with titles and content
4. Language style and tone (formal, casual, poetic, etc.)
5. Key themes and topics

Return JSON with this structure:
{
  "entries": [
    {
      "content": "...",
      "date": "YYYY-MM-DD",
      "tags": ["tag1"],
      "content_type": "standard" | "testimony" | "advice" | "message_to_reader" | etc (optional, auto-detected if missing),
      "preserve_original_language": true/false (optional, auto-detected if missing),
      "original_content": "exact original text" (optional, defaults to content)
    }
  ],
  "characters": [{"name": "...", "description": "...", "relationships": ["..."]}],
  "memoirSections": [{"title": "...", "content": "...", "period": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}}],
  "languageStyle": "description of writing style and tone",
  "keyThemes": ["theme1", "theme2"]
}

Detection patterns to look for:
- "Dear reader", "To the reader", "If you're reading this" → message_to_reader
- "Why I wrote", "My testimony", "I want to share" → testimony
- "I advise", "Remember", "Don't forget", "To anyone" → advice
- "I dedicate", "To my", "For my" → dedication
- "I vow", "I promise", "I declare" → vow/promise/declaration`
        },
        {
          role: 'user',
          content: `Document: ${fileName}\n\nContent:\n${text.substring(0, 50000)}` // Limit to avoid token limits
        }
      ]
    });

    const response = completion.choices[0]?.message?.content || '{}';
    
    try {
      // Extract JSON from response (might be wrapped in markdown code blocks)
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
      return JSON.parse(jsonStr) as DocumentAnalysis;
    } catch (error) {
      logger.error({ error, response }, 'Failed to parse document analysis');
      // Fallback: create basic structure
      return {
        entries: [{ content: text.substring(0, 1000), date: new Date().toISOString().split('T')[0] }],
        characters: [],
        memoirSections: [],
        languageStyle: 'Unknown',
        keyThemes: []
      };
    }
  }

  private async storeOriginalDocument(
    userId: string,
    text: string,
    fileName: string,
    languageStyle: string
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('original_documents')
      .upsert({
        id: uuid(),
        user_id: userId,
        file_name: fileName,
        content: text,
        language_style: languageStyle,
        uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,file_name'
      });

    if (error) {
      logger.error({ error }, 'Failed to store original document');
      throw error;
    }
  }

  private async createEntriesFromDocument(
    userId: string,
    entries: Array<{ 
      content: string; 
      date: string; 
      tags?: string[];
      content_type?: string;
      preserve_original_language?: boolean;
      original_content?: string;
    }>
  ): Promise<number> {
    let created = 0;
    for (const entry of entries) {
      try {
        // Auto-detect content type if not provided by AI analysis
        const detected = entry.content_type 
          ? { 
              type: entry.content_type, 
              preserveOriginal: entry.preserve_original_language ?? false,
              confidence: 0.9 // High confidence if AI detected it
            }
          : detectContentType(entry.content);
        
        // Use original_content if provided, otherwise use content
        const originalContent = entry.original_content || entry.content;
        
        await memoryService.saveEntry({
          userId,
          content: entry.content,
          date: entry.date,
          tags: entry.tags || [],
          source: 'document_upload',
          content_type: detected.type,
          original_content: originalContent,
          preserve_original_language: detected.preserveOriginal,
          metadata: { 
            imported: true,
            detection_confidence: detected.confidence,
            auto_detected: !entry.content_type
          }
        });
        created++;
      } catch (error) {
        logger.warn({ error, entry }, 'Failed to create entry from document');
      }
    }
    return created;
  }

  private async createCharactersFromDocument(
    userId: string,
    characters: Array<{ name: string; description?: string; relationships?: string[] }>
  ): Promise<number> {
    let created = 0;
    for (const char of characters) {
      try {
        const id = uuid();
        
        // Generate avatar URL
        const style = avatarStyleFor('human'); // Default to human style for document-imported characters
        const dicebearUrl = characterAvatarUrl(id, style);
        
        // Try to cache avatar (optional - failures are handled gracefully)
        let avatarUrl = dicebearUrl;
        try {
          avatarUrl = await cacheAvatar(id, dicebearUrl);
        } catch (error) {
          logger.warn({ error, characterId: id }, 'Avatar caching failed for document-imported character');
        }

        const { error } = await supabaseAdmin
          .from('characters')
          .upsert({
            id,
            user_id: userId,
            name: char.name,
            summary: char.description || null,
            avatar_url: avatarUrl,
            metadata: {
              relationships: char.relationships || [],
              imported: true
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,name'
          });

        if (!error) created++;
      } catch (error) {
        logger.warn({ error, char }, 'Failed to create character from document');
      }
    }
    return created;
  }

  private async createMemoirSectionsFromDocument(
    userId: string,
    sections: Array<{ title: string; content: string; period?: { from: string; to: string } }>,
    languageStyle: string
  ): Promise<number> {
    if (sections.length === 0) return 0;

    const outline = await memoirService.getOutline(userId);
    
    // Store language style preference
    if (!outline.metadata) {
      outline.metadata = {};
    }
    outline.metadata.languageStyle = languageStyle;
    outline.metadata.originalDocument = true;

    for (const section of sections) {
      const memoirSection = {
        id: uuid(),
        title: section.title,
        content: section.content,
        order: outline.sections.length,
        period: section.period,
        lastUpdated: new Date().toISOString(),
        imported: true
      };
      outline.sections.push(memoirSection);
    }

    // Sort chronologically
    outline.sections.sort((a, b) => {
      const aDate = a.period?.from || '';
      const bDate = b.period?.from || '';
      return aDate.localeCompare(bDate);
    });

    await memoirService.saveOutline(userId, outline);
    return sections.length;
  }

  async getLanguageStyle(userId: string): Promise<string | null> {
    try {
      // Try to get from memoir outline metadata first
      const outline = await memoirService.getOutline(userId);
      if (outline.metadata?.languageStyle) {
        return outline.metadata.languageStyle as string;
      }

      // Fallback to original_documents table if it exists
      const { data, error } = await supabaseAdmin
        .from('original_documents')
        .select('language_style')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.warn({ error }, 'Error fetching language style from original_documents');
      }

      return data?.language_style || null;
    } catch (error) {
      logger.warn({ error }, 'Failed to get language style');
      return null;
    }
  }
}

export const documentService = new DocumentService();

