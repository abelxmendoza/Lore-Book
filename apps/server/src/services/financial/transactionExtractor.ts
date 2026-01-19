import { logger } from '../../logger';

import type { FinancialTransaction, TransactionCategory } from './types';

/**
 * Extracts financial transactions from journal entries
 */
export class TransactionExtractor {
  /**
   * Extract financial transactions from entries
   */
  extract(entries: any[]): FinancialTransaction[] {
    const transactions: FinancialTransaction[] = [];

    try {
      // Money amount patterns (supports $100, 100, $100.50, etc.)
      const moneyRegex = /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)\s*(?:dollars?|bucks?)?/i;

      const categories: Array<{ cat: TransactionCategory; regex: RegExp }> = [
        { cat: 'food', regex: /(ate|restaurant|food|groceries|bbq|taco|coffee|dining|meal|lunch|dinner|breakfast|pizza|burger)/i },
        { cat: 'transport', regex: /(uber|lyft|taxi|gas|fuel|ride|bus|car|parking|toll|metro|subway|train|flight|airplane)/i },
        { cat: 'rent', regex: /(rent|lease|landlord|apartment|housing|mortgage)/i },
        { cat: 'entertainment', regex: /(movie|cinema|club|bar|show|game|concert|theater|netflix|hulu|disney|streaming)/i },
        { cat: 'shopping', regex: /(bought|shopping|clothes|gear|purchase|amazon|store|mall|retail)/i },
        { cat: 'subscriptions', regex: /(subscription|netflix|spotify|duolingo|gym|membership|monthly|annual|recurring)/i },
        { cat: 'debt', regex: /(loan|credit|debt|interest|payment|pay off|payback|borrow|owe)/i },
        { cat: 'investment', regex: /(stock|crypto|invest|bought shares|spy|btc|ethereum|portfolio|trading|401k|ira|retirement)/i },
        { cat: 'income', regex: /(paid|paycheck|deposit|check|salary|wage|earned|income|bonus|commission|freelance)/i },
        { cat: 'healthcare', regex: /(doctor|hospital|medical|pharmacy|prescription|insurance|health)/i },
        { cat: 'education', regex: /(school|tuition|course|education|book|textbook|learning)/i },
        { cat: 'utilities', regex: /(electric|water|gas bill|internet|phone|utility|electricity)/i },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        // Find money amounts
        const matches = content.matchAll(new RegExp(moneyRegex.source, 'gi'));
        
        for (const match of matches) {
          const amountStr = match[1].replace(/,/g, ''); // Remove commas
          const amount = parseFloat(amountStr);

          if (isNaN(amount) || amount <= 0) continue;

          // Determine category
          let category: TransactionCategory = 'uncategorized';
          let direction: 'in' | 'out' = 'out';

          // Check for income first
          if (categories.find(c => c.cat === 'income')?.regex.test(content)) {
            category = 'income';
            direction = 'in';
          } else {
            // Check other categories
            for (const cat of categories) {
              if (cat.cat !== 'income' && cat.regex.test(content)) {
                category = cat.cat;
                break;
              }
            }
          }

          // Additional context clues for direction
          if (direction === 'out') {
            const expenseKeywords = ['spent', 'paid', 'bought', 'cost', 'expense', 'bills'];
            const incomeKeywords = ['received', 'got', 'earned', 'made', 'income'];
            
            const contentLower = content.toLowerCase();
            if (incomeKeywords.some(k => contentLower.includes(k))) {
              direction = 'in';
              if (category === 'uncategorized') {
                category = 'income';
              }
            }
          }

          transactions.push({
            id: `transaction_${entry.id}_${Date.now()}_${Math.random()}`,
            timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
            category,
            amount,
            direction,
            evidence: content.substring(0, 500),
            entry_id: entry.id,
            metadata: {
              source_entry_id: entry.id,
              extracted_amount: amountStr,
            },
          });
        }
      }

      logger.debug({ transactions: transactions.length, entries: entries.length }, 'Extracted financial transactions');

      return transactions;
    } catch (error) {
      logger.error({ error }, 'Failed to extract transactions');
      return [];
    }
  }
}

