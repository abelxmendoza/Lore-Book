import { supabaseAdmin } from '../services/supabaseClient';
import { peoplePlacesService } from '../services/peoplePlacesService';

async function run() {
  const { data: entries } = await supabaseAdmin
    .from('journal_entries')
    .select('id, user_id, content, date, tags, mood, summary, source, metadata');
  let count = 0;
  for (const entry of entries ?? []) {
    try {
      await peoplePlacesService.recordEntitiesForEntry(entry as any);
    } catch (e) { /* continue */ }
    await new Promise(r => setTimeout(r, 150));
    count++;
  }
  console.log('Done. Re-extracted:', count, 'entries');
  const { data: entities } = await supabaseAdmin
    .from('people_places')
    .select('name, type, total_mentions')
    .order('total_mentions', { ascending: false });
  console.log(JSON.stringify(entities, null, 2));
}
run().catch(console.error);
