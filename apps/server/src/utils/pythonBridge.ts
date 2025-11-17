import { spawn } from 'child_process';

import { logger } from '../logger';

const DISPATCHER = `import importlib
import json
import sys

payload = json.loads(sys.stdin.read() or '{}')
selector = sys.argv[1]
if ':' in selector:
    module_path, func_name = selector.split(':', 1)
else:
    module_path, func_name = selector, 'handle'
module = importlib.import_module(module_path)
func = getattr(module, func_name)
result = func(**payload) if callable(func) else func
print(json.dumps(result, default=str))
`;

const runPython = (target: string, payload: Record<string, unknown>): Promise<any> => {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', DISPATCHER, target], { stdio: ['pipe', 'pipe', 'inherit'] });

    let stdout = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python process exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(stdout || '{}'));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
};

export const callPython = async (target: string, payload: Record<string, unknown>) => {
  try {
    return await runPython(target, payload);
  } catch (error) {
    logger.warn({ error, target }, 'Python bridge failed');
    throw error;
  }
};

export const spawnPython = callPython;
