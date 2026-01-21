interface AdminTableProps {
  columns: string[];
  data: any[];
}

export const AdminTable = ({ columns, data }: AdminTableProps) => {
  const formatValue = (value: any, column: string): string => {
    if (value === null || value === undefined) return '-';
    
    // Format dates
    if (column.toLowerCase().includes('date') || column.toLowerCase().includes('timestamp') || column.toLowerCase() === 'createdat') {
      try {
        return new Date(value).toLocaleString();
      } catch {
        return String(value);
      }
    }
    
    // Format objects
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  };

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <div className="inline-block min-w-full align-middle">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-purple-500/30">
              {columns.map((col) => (
                <th key={col} className="text-left py-2 sm:py-3 px-2 sm:px-4 text-white/70 font-medium whitespace-nowrap">
                  {col.charAt(0).toUpperCase() + col.slice(1).replace(/([A-Z])/g, ' $1')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-white/50">
                  No data available
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr key={idx} className="border-b border-purple-500/10 hover:bg-purple-500/5">
                  {columns.map((col) => (
                    <td key={col} className="py-2 sm:py-3 px-2 sm:px-4 text-white/80">
                      {formatValue(row[col], col)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

