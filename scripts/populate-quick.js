/**
 * QUICK POPULATION SCRIPT - Paste this into browser console
 * 
 * Make sure your server is running: pnpm dev:server
 * Then open browser console (F12) and paste this entire script
 */

(async function populateQuick() {
  console.log('🚀 Starting quick population...');
  
  const results = { chapters: 0, entries: 0, characters: 0, errors: [] };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  
  async function apiCall(endpoint, method = 'GET', body = null) {
    try {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(endpoint, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error(`❌ ${endpoint}:`, e.message);
      results.errors.push({ endpoint, error: e.message });
      return null;
    }
  }
  
  const now = new Date();
  
  // 1. Create Chapters
  console.log('📖 Creating chapters...');
  const chapters = [
    { title: "The Beginning", startDate: new Date(now.getFullYear() - 1, 0, 1).toISOString(), endDate: new Date(now.getFullYear() - 1, 5, 30).toISOString(), description: "Starting my journey" },
    { title: "Growth Phase", startDate: new Date(now.getFullYear() - 1, 6, 1).toISOString(), endDate: new Date(now.getFullYear(), 5, 30).toISOString(), description: "Learning and growing" },
    { title: "Current Chapter", startDate: new Date(now.getFullYear(), 6, 1).toISOString(), endDate: null, description: "Living intentionally" }
  ];
  
  const chapterIds = [];
  for (const ch of chapters) {
    const r = await apiCall('/api/chapters', 'POST', { title: ch.title, startDate: ch.startDate, endDate: ch.endDate, description: ch.description });
    if (r?.chapter) { chapterIds.push(r.chapter.id); results.chapters++; console.log(`  ✓ ${ch.title}`); }
    await wait(100);
  }
  
  // 2. Create Characters
  console.log('\n👥 Creating characters...');
  const chars = [
    { name: "Sarah Chen", role: "Best Friend", summary: "My closest friend and confidante", tags: ["friendship", "support"] },
    { name: "Marcus Johnson", role: "Mentor", summary: "A wise mentor guiding my career", tags: ["mentorship", "career"] },
    { name: "Alex Rivera", role: "Collaborator", summary: "Creative collaborator on projects", tags: ["creativity", "professional"] },
    { name: "Jordan Kim", role: "Sibling", summary: "My sibling and important person in my life", tags: ["family", "support"] },
    { name: "The Coffee Shop", role: "Workspace", summary: "Favorite place to work and think", tags: ["workspace", "creativity"] }
  ];
  
  for (const char of chars) {
    const r = await apiCall('/api/characters', 'POST', char);
    if (r?.character) { results.characters++; console.log(`  ✓ ${char.name}`); }
    await wait(100);
  }
  
  // 3. Create Entries
  console.log('\n📝 Creating entries...');
  const entries = [
    { content: "Just had an amazing conversation with Sarah about our future plans. We discussed starting a creative project together. The energy was incredible!", tags: ['friendship', 'creativity'], mood: 'excited', date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), chapterId: chapterIds[2] || null, relationships: [{ name: 'Sarah Chen', tag: 'friend' }] },
    { content: "Finished reading a book by Marcus's recommendation. The insights about creativity really resonated with me. Key takeaway: creativity is about showing up consistently.", tags: ['reading', 'learning'], mood: 'thoughtful', date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), chapterId: chapterIds[2] || null, relationships: [{ name: 'Marcus Johnson', tag: 'coach' }] },
    { content: "Spent the afternoon at The Coffee Shop working on my novel. Wrote 2,000 words - a personal best! The environment there really helps me focus.", tags: ['writing', 'achievement'], mood: 'accomplished', date: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), chapterId: chapterIds[2] || null, relationships: [{ name: 'The Coffee Shop', tag: 'other' }] },
    { content: "Had dinner with Jordan tonight. We laughed, shared stories, and enjoyed each other's company. These moments remind me what's truly important.", tags: ['family', 'gratitude'], mood: 'grateful', date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(), chapterId: chapterIds[2] || null, relationships: [{ name: 'Jordan Kim', tag: 'family' }] },
    { content: "Started learning a new programming language today. The syntax is different but I'm enjoying the challenge. Building something new always feels rewarding.", tags: ['learning', 'programming'], mood: 'curious', date: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), chapterId: chapterIds[1] || null },
    { content: "Reflected on my progress this month. I've grown in ways I didn't expect, and I'm proud of the person I'm becoming. The journey continues!", tags: ['reflection', 'growth'], mood: 'proud', date: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(), chapterId: chapterIds[1] || null },
    { content: "Spent the day working on a creative project with Alex. Our brainstorming session was incredibly productive. I love how we bounce ideas off each other.", tags: ['collaboration', 'creativity'], mood: 'inspired', date: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), chapterId: chapterIds[1] || null, relationships: [{ name: 'Alex Rivera', tag: 'professional' }] },
    { content: "Went for a long walk today. The weather was perfect, and I felt a sense of peace I haven't felt in a while. Sometimes the simplest moments are the most meaningful.", tags: ['nature', 'peace'], mood: 'peaceful', date: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(), chapterId: chapterIds[0] || null },
    { content: "Attended a workshop on mindfulness today. Learned new techniques for staying present. The instructor was fantastic, and I'm excited to practice these methods daily.", tags: ['mindfulness', 'growth'], mood: 'calm', date: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(), chapterId: chapterIds[0] || null },
    { content: "Started this journaling practice today. Not sure where it will lead, but I feel like documenting my journey is important. Maybe someday I'll look back and see how far I've come.", tags: ['journaling', 'beginning'], mood: 'hopeful', date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), chapterId: chapterIds[0] || null }
  ];
  
  for (const entry of entries) {
    const r = await apiCall('/api/entries', 'POST', entry);
    if (r?.entry || r?.id) { results.entries++; if (results.entries % 3 === 0) console.log(`  ✓ Created ${results.entries} entries...`); }
    await wait(50);
  }
  
  console.log('\n✅ Population complete!');
  console.log(`📖 Chapters: ${results.chapters}`);
  console.log(`👥 Characters: ${results.characters}`);
  console.log(`📝 Entries: ${results.entries}`);
  if (results.errors.length > 0) {
    console.warn(`⚠️  ${results.errors.length} errors occurred`);
    results.errors.forEach(e => console.warn(`  - ${e.endpoint}: ${e.error}`));
  } else {
    console.log('✨ All data created successfully!');
  }
  console.log('\n🔄 Refreshing page in 2 seconds...');
  setTimeout(() => window.location.reload(), 2000);
  
  return results;
})();

