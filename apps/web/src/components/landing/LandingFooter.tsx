// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { Link } from 'react-router-dom';
import { Logo } from '../Logo';
import { Github, Twitter, Mail } from 'lucide-react';
import { CONTACT_EMAIL, CONTACT_LINK_PROPS } from '../../lib/contact';

type FooterLink =
  | { type: 'route'; path: string; label: string }
  | { type: 'external'; label: string };

export const LandingFooter = () => {
  const currentYear = new Date().getFullYear();

  const footerLinks: Record<string, FooterLink[]> = {
    Product: [
      { type: 'route', path: '/features', label: 'Features' },
      { type: 'route', path: '/lore', label: 'Lore' },
      { type: 'route', path: '/about', label: 'About' },
      { type: 'route', path: '/login', label: 'Sign In' },
    ],
    Company: [
      { type: 'route', path: '/about', label: 'Team' },
      { type: 'route', path: '/investors', label: 'Investors' },
    ],
    Contact: [
      { type: 'external', label: 'Contact Us' },
    ],
    Legal: [
      { type: 'route', path: '/terms', label: 'Terms of Service' },
      { type: 'route', path: '/privacy-policy', label: 'Privacy Policy' },
    ],
  };

  return (
    <footer className="bg-black/60 border-t border-border/60 mt-12 sm:mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6 sm:gap-8">
          {/* Brand Column */}
          <div className="col-span-2 sm:col-span-3 md:col-span-1">
            <Logo size="md" showText={true} />
            <p className="mt-3 sm:mt-4 text-sm text-white/60 leading-relaxed">
              A life memory system — conversation in, lasting lore out.
            </p>
            <a
              {...CONTACT_LINK_PROPS}
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition"
            >
              <Mail className="h-3.5 w-3.5" />
              {CONTACT_EMAIL}
            </a>
            <p className="mt-2 text-xs text-white/40">
              © {currentYear} Omega Technologies
            </p>
          </div>

          {/* Links Columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-white mb-3 sm:mb-4">{category}</h3>
              <ul className="space-y-2 sm:space-y-3">
                {links.map((link) => (
                  <li key={`${category}-${link.label}`}>
                    {link.type === 'external' ? (
                      <a
                        {...CONTACT_LINK_PROPS}
                        className="text-sm text-white/60 hover:text-primary transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.path}
                        className="text-sm text-white/60 hover:text-primary transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-border/60 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-white/40 text-center sm:text-left">
            Licensed under MIT. Brand and product identity retained by Omega Technologies.
          </p>
          <div className="flex items-center gap-4">
            <a
              {...CONTACT_LINK_PROPS}
              className="text-sm text-white/60 hover:text-primary transition-colors"
            >
              Contact Us
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 hover:text-primary transition-colors"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 hover:text-primary transition-colors"
              aria-label="Twitter"
            >
              <Twitter className="h-5 w-5" />
            </a>
            <a
              {...CONTACT_LINK_PROPS}
              className="text-white/60 hover:text-primary transition-colors"
              aria-label="Email"
            >
              <Mail className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
