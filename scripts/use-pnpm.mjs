#!/usr/bin/env node
// Runs before every install (root `preinstall`). This project is a pnpm workspace: npm, yarn and bun
// can't link its packages (npm stops with "Unsupported URL Type workspace:"). Say what to do instead.
const agent = process.env.npm_config_user_agent ?? '';
if (!agent.startsWith('pnpm/')) {
  const tool = agent.split('/')[0] || 'this tool';
  console.error(
    [
      '',
      `MoversHub installs with pnpm, not ${tool}.`,
      '  1. Install pnpm 10 once:  npm install -g pnpm@10   (macOS/Linux without admin rights: corepack enable pnpm)',
      '  2. Then, in the project folder:  pnpm install',
      'See README "Run it locally".',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
