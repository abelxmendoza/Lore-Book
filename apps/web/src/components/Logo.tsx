import { cn } from '../lib/cn';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

const sizeClasses = {
  sm: 'h-12',
  md: 'h-20',
  lg: 'h-32',
  xl: 'h-40'
};

export const Logo = ({ className, size = 'md', showText = true }: LogoProps) => {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="relative">
        <img 
          src="/images/loreKeeperlogo3.png" 
          alt="Lore Keeper Logo" 
          className={cn(
            'flex-shrink-0 object-contain drop-shadow-[0_0_15px_rgba(124,58,237,0.5)]',
            sizeClasses[size]
          )}
        />
        {/* Subtle glow effect */}
        <div className="absolute inset-0 bg-primary/20 blur-xl -z-10" />
      </div>
      {showText && (
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-primary tracking-wider drop-shadow-[0_0_8px_rgba(124,58,237,0.6)]">LORE</span>
          <span className="text-2xl font-bold text-gray-300 tracking-wider">KEEPER</span>
        </div>
      )}
    </div>
  );
};

