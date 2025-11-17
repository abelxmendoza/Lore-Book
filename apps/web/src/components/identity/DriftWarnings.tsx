export const DriftWarnings = ({ warnings }: { warnings: string[] }) => (
  <div className="space-y-2 rounded-lg border border-secondary/30 bg-secondary/10 p-3 text-sm text-secondary">
    <div className="text-xs uppercase tracking-wide text-secondary/80">Drift Warnings</div>
    {warnings.length ? warnings.map((warning) => <div key={warning}>{warning}</div>) : <p>No drift detected.</p>}
  </div>
);
