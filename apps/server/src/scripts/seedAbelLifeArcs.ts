/**
 * Idempotent import of the founder's (Abel's) initial life-arc seed data into
 * the existing life_arcs table, via the existing arcService — no new schema,
 * no new "lanes" table. Safe to re-run: arcService.upsert keys on
 * (user_id, title), so re-running never creates duplicates.
 *
 * The existing life_arcs.track enum (career/romance/relationships/creative/
 * health/inner/mixed/custom) has no exact match for two of the source
 * blueprint's seven named lanes ("Education + Tech", "LoreBook / Projects").
 * Rather than fabricate new track values, each arc's original human-readable
 * lane name is preserved verbatim in metadata.original_lane (and as a
 * `lane:<slug>` tag), so nothing is lost and the mapping is recoverable once
 * real user-configurable lanes exist. See metadata.date_precision for the
 * same non-fabrication treatment of approximate dates — start_date/end_date
 * are best-effort calendar bounds for rendering in the existing swimlane UI
 * today; date_precision is the honest signal for anything that isn't an
 * exact day.
 *
 * Usage: cd apps/server && npx tsx src/scripts/seedAbelLifeArcs.ts <email>
 */
import 'dotenv/config';
import { supabaseAdmin } from '../services/supabaseClient';
import type { UpsertArcPayload } from '../services/continuityRuntime/arcs/arcService';

type DatePrecision = 'exact_day' | 'month' | 'year' | 'range' | 'approximate' | 'unknown';

type SeedArc = Omit<UpsertArcPayload, 'metadata' | 'tags'> & {
  originalLane: string;
  datePrecision: DatePrecision;
};

function laneSlug(lane: string): string {
  return lane.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const SEED_ARCS: SeedArc[] = [
  // --- Career ---
  {
    originalLane: 'Career',
    title: 'Restaurant Work',
    arc_type: 'life_era',
    track: 'career',
    start_date: '2018-01-01',
    end_date: '2024-12-31',
    datePrecision: 'year',
    summary:
      'Worked across restaurant operations including El Pollo Loco, Chipotle, Rubio’s Coastal Grill, and Ono Hawaiian BBQ. This was a long operations chapter before moving deeper into robotics and electronics.',
  },
  {
    originalLane: 'Career',
    title: 'Serve Robotics',
    arc_type: 'life_era',
    track: 'career',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    datePrecision: 'year',
    summary: 'Field operations supporting autonomous food-delivery robots in Hollywood and Downtown Los Angeles.',
  },
  {
    originalLane: 'Career',
    title: 'Armstrong Robotics',
    arc_type: 'life_era',
    track: 'career',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    datePrecision: 'year',
    summary:
      'Restaurant robotics operations involving live deployment, troubleshooting, and field support for autonomous dishwashing robots.',
  },
  {
    originalLane: 'Career',
    title: 'Electronics / Validation Transition',
    arc_type: 'life_era',
    track: 'career',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    datePrecision: 'year',
    summary:
      'Worked across electronics test, validation, failure analysis, and QA, including RLH Industries and Amazon Ring, while moving toward embedded systems, autonomy, robotics, aerospace, and validation-focused roles.',
  },
  {
    originalLane: 'Career',
    title: 'Next-Role Campaign',
    arc_type: 'life_era',
    track: 'career',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    datePrecision: 'year',
    summary:
      'Career transition involving opportunities and interviews across companies and roles related to Rivian, Schneider Electric, Southern California Edison, UAV autonomy, eVTOL, aerospace, electronics, and robotics.',
  },

  // --- Education + Tech (no exact track match — mapped to 'career', see header) ---
  {
    originalLane: 'Education + Tech',
    title: 'Alternative Energy Technology',
    arc_type: 'life_era',
    track: 'career',
    start_date: '2014-01-01',
    end_date: '2018-12-31',
    datePrecision: 'year',
    summary:
      'Studied Alternative Energy Technology at Rio Hondo College and gained hands-on experience including residential solar installation.',
  },
  {
    originalLane: 'Education + Tech',
    title: 'Computer Science',
    arc_type: 'life_era',
    track: 'career',
    start_date: '2020-01-01',
    end_date: '2024-12-31',
    datePrecision: 'year',
    summary:
      'Computer science education culminating in a B.S. in Computer Science from California State University, Fullerton in 2024.',
  },
  {
    originalLane: 'Education + Tech',
    title: 'Robotics Builder Era',
    arc_type: 'life_era',
    track: 'career',
    start_date: '2024-01-01',
    end_date: null,
    datePrecision: 'year',
    summary:
      'Increasing focus on ROS, C++, embedded systems, robotics, computer vision, autonomy, AI, and hands-on systems engineering.',
  },

  // --- Martial Arts (mapped to 'health') ---
  {
    originalLane: 'Martial Arts',
    title: 'Muay Thai Foundation',
    arc_type: 'life_era',
    track: 'health',
    start_date: '2012-01-01',
    end_date: '2013-12-31',
    datePrecision: 'approximate',
    summary: 'Competitive Muay Thai background with a 6–0 record during the late-teen period.',
  },
  {
    originalLane: 'Martial Arts',
    title: 'BJJ / MMA',
    arc_type: 'life_era',
    track: 'health',
    start_date: '2015-01-01',
    end_date: null,
    datePrecision: 'year',
    summary: 'Brazilian Jiu-Jitsu and MMA training, including training at Tillis BJJ and MMA.',
  },
  {
    originalLane: 'Martial Arts',
    title: 'Return to Striking',
    arc_type: 'life_era',
    track: 'health',
    start_date: '2026-01-01',
    end_date: null,
    datePrecision: 'year',
    summary: 'Returned to regular kickboxing training and began rebuilding a consistent striking practice.',
  },

  // --- Creative ---
  {
    originalLane: 'Creative',
    title: 'Photography Roots',
    arc_type: 'life_era',
    track: 'creative',
    start_date: '2014-01-01',
    end_date: '2018-12-31',
    datePrecision: 'approximate',
    summary: 'Worked as a party photographer during high school, forming an early creative and entrepreneurial chapter.',
  },
  {
    originalLane: 'Creative',
    title: 'Creator Experiments',
    arc_type: 'life_era',
    track: 'creative',
    start_date: '2024-01-01',
    end_date: '2025-12-31',
    datePrecision: 'year',
    summary: 'Produced robotics content and previously created beer-brewing tutorials.',
  },
  {
    originalLane: 'Creative',
    title: 'Ángel Negr0',
    arc_type: 'life_era',
    track: 'creative',
    start_date: '2026-01-01',
    end_date: null,
    datePrecision: 'year',
    summary:
      'Music project centered around post-punk, darkwave, punk, bilingual songwriting, releases, visual identity, and experimentation with AI-assisted music tools.',
  },

  // --- LoreBook / Projects (no exact track match — mapped to 'custom', see header) ---
  {
    originalLane: 'LoreBook / Projects',
    title: 'LoreBook Emerges',
    arc_type: 'life_era',
    track: 'custom',
    start_date: '2026-01-01',
    end_date: null,
    datePrecision: 'year',
    summary:
      'Development of LoreBook as a personal memory operating system designed to preserve, structure, query, correct, and publish a person’s life history.',
  },
  {
    originalLane: 'LoreBook / Projects',
    title: 'Canonical Architecture',
    arc_type: 'life_era',
    track: 'custom',
    start_date: '2026-01-01',
    end_date: null,
    datePrecision: 'year',
    summary:
      'Development work including canonical temporal modeling, context assembly, update orchestration, canonical mutation governance, cognitive evaluation, publishing architecture, canonical state, and observability.',
  },
  {
    originalLane: 'LoreBook / Projects',
    title: 'Reality-Check Phase',
    arc_type: 'life_era',
    track: 'custom',
    start_date: '2026-01-01',
    end_date: null,
    datePrecision: 'year',
    summary:
      'Current focus on chronology correctness, chatbot/UI synchronization, context boundaries, fabricated-date prevention, timeline reliability, and validating whether other people receive enough value from LoreBook to repeatedly use it.',
  },

  // --- Relationships + Social ---
  {
    originalLane: 'Relationships + Social',
    title: 'Long-Term Relationship',
    arc_type: 'life_era',
    track: 'romance',
    start_date: '2015-01-01',
    end_date: '2019-12-31',
    datePrecision: 'year',
    summary: 'Four-year relationship representing a major early-adult personal chapter.',
  },
  {
    originalLane: 'Relationships + Social',
    title: 'LA/OC Scene Chapter',
    arc_type: 'life_era',
    track: 'relationships',
    start_date: '2025-01-01',
    end_date: null,
    datePrecision: 'approximate',
    summary: 'Increasing involvement in punk, ska, metal, nightlife, shows, and related LA/OC communities.',
  },
  {
    originalLane: 'Relationships + Social',
    title: 'Scene Rupture',
    arc_type: 'life_era',
    track: 'relationships',
    start_date: '2026-06-01',
    end_date: '2026-08-31',
    datePrecision: 'approximate',
    summary:
      'Major social break involving withdrawal from parts of the ska scene, reassessment of community, reputation concerns, and a shift away from previous social environments.',
  },

  // --- Life ---
  {
    originalLane: 'Life',
    title: 'Working-Class Build',
    arc_type: 'life_era',
    track: 'inner',
    start_date: '2014-01-01',
    end_date: '2024-12-31',
    datePrecision: 'approximate',
    summary:
      'A long period where school, restaurant work, solar work, technical jobs, martial arts, and repeated reinvention overlapped rather than following one clean career ladder.',
  },
  {
    originalLane: 'Life',
    title: 'Japan / Expansion',
    arc_type: 'life_era',
    track: 'inner',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    datePrecision: 'approximate',
    summary: 'Travel to Japan connected to Japanese-language studies and a broader period of international and cultural exploration.',
  },
  {
    originalLane: 'Life',
    title: 'Reconstruction',
    arc_type: 'life_era',
    track: 'inner',
    start_date: '2026-01-01',
    end_date: null,
    datePrecision: 'year',
    summary:
      'An intense rebuilding period combining career instability, technical ambition, LoreBook development, music, martial arts training, and reassessment of social direction.',
  },
];

async function resolveUserId(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const match = data.users.find((u) => u.email === email);
  if (!match) throw new Error(`No user found for ${email}`);
  return match.id;
}

/**
 * arcService.upsert() relies on an ON CONFLICT (user_id, title) clause, but
 * the live life_arcs table has no unique constraint backing that — the
 * upsert throws 42P10. Rather than alter shared schema/service code from
 * this standalone seed script, idempotency is implemented locally here:
 * look up by (user_id, title) first, then insert or update directly.
 */
async function upsertArcByTitle(
  userId: string,
  payload: UpsertArcPayload & { tags: string[]; metadata: Record<string, unknown> }
): Promise<'created' | 'updated'> {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('life_arcs')
    .select('id')
    .eq('user_id', userId)
    .eq('title', payload.title)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await supabaseAdmin
      .from('life_arcs')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('user_id', userId);
    if (error) throw error;
    return 'updated';
  }

  const { error } = await supabaseAdmin.from('life_arcs').insert({ user_id: userId, ...payload });
  if (error) throw error;
  return 'created';
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx src/scripts/seedAbelLifeArcs.ts <email>');
    process.exit(1);
  }

  const userId = await resolveUserId(email);
  console.log(`Seeding ${SEED_ARCS.length} life arcs for ${email} (${userId})`);

  let created = 0;
  let updated = 0;
  for (const arc of SEED_ARCS) {
    const { originalLane, datePrecision, ...payload } = arc;
    const result = await upsertArcByTitle(userId, {
      ...payload,
      is_active: true,
      confidence: 1,
      source: 'user_created',
      tags: [`lane:${laneSlug(originalLane)}`],
      metadata: {
        original_lane: originalLane,
        date_precision: datePrecision,
        seed_source: 'abel_life_arcs_blueprint_v1',
      },
    });
    if (result === 'created') created += 1;
    else updated += 1;
    console.log(`  ✓ ${arc.title} (${result})`);
  }

  console.log(`Done. ${created} created, ${updated} updated (idempotent — safe to re-run).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
