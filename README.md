# Lore Keeper

AI-powered journaling platform by Omega Technologies.

## Features

- 📖 **Journal Entries** - Rich journaling with tags, moods, and summaries
- 📚 **Chapters** - Organize your life into meaningful chapters
- 👥 **Characters** - Track people and places in your story
- 💬 **AI Chat** - Get insights and guidance from AI
- 📊 **Timeline** - Visualize your journey over time
- ✅ **Tasks** - Manage goals and milestones
- 🧠 **Insights** - Discover patterns and connections

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-4
- **Testing**: Vitest + Playwright

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- Supabase account (or local Supabase)

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Run database migrations
psql "your-supabase-db-url" -f migrations/000_setup_all_tables.sql

# Seed dummy data (optional)
psql "your-supabase-db-url" -f migrations/001_seed_dummy_data.sql
```

### Development

```bash
# Start web app
pnpm dev:web

# Start server (in another terminal)
pnpm dev:server
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run E2E tests
pnpm test:e2e
```

### Building

```bash
# Build all apps
pnpm build
```

## Project Structure

```
lorekeeper/
├── apps/
│   ├── web/          # Frontend React app
│   └── server/       # Backend Express API
├── migrations/       # Database migrations
├── scripts/          # Utility scripts
└── .github/          # GitHub Actions workflows
```

## CI/CD

The project uses GitHub Actions for CI/CD:

- **Lint**: Code linting on push/PR
- **Test**: Unit and integration tests
- **E2E**: End-to-end tests with Playwright
- **Build**: Build verification
- **Security**: Dependency scanning

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

Private - Omega Technologies
