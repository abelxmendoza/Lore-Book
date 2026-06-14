/**
 * Re-scan organization hierarchy links (name nesting, overlap, optional LLM on re-read).
 * Usage: npx tsx scripts/reconcile-org-relationships.ts --user email@example.com
 */
import { organizationRelationshipInferenceService } from '../apps/server/src/services/organizationRelationshipInferenceService';
import { organizationNetworkService } from '../apps/server/src/services/organizationNetworkService';
import { supabaseAdmin } from '../apps/server/src/services/supabaseClient';

async function main() {
  const emailArg = process.argv.find((a, i) => process.argv[i - 1] === '--user');
  if (!emailArg) {
    console.error('Usage: npx tsx scripts/reconcile-org-relationships.ts --user email@example.com');
    process.exit(1);
  }

  const { data } = await supabaseAdmin.auth.admin.listUsers();
  const user = data?.users?.find(u => u.email === emailArg);
  if (!user) {
    console.error('User not found:', emailArg);
    process.exit(1);
  }

  const result = await organizationRelationshipInferenceService.reconcileUserOrganizations(user.id);
  console.log('Reconcile result:', result);

  const net = await organizationNetworkService.buildNetwork(user.id);
  console.log(`Network: ${net.orgCount} orgs, ${net.edgeCount} edges, root: ${net.rootOrg?.name ?? 'none'}`);
  for (const e of net.edges) {
    const from = net.nodes.find(n => n.id === e.fromId)?.name;
    const to = net.nodes.find(n => n.id === e.toId)?.name;
    console.log(`  ${from} —[${e.relationshipType}]→ ${to}${e.inferred ? ' (learned)' : ''}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
