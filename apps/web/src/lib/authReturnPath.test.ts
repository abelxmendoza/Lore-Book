import { describe, it, expect, beforeEach } from 'vitest';
import {
  consumeAuthReturnPath,
  DEFAULT_APP_PATH,
  LANDING_PATH,
  saveAuthReturnPath,
} from './authReturnPath';

describe('authReturnPath', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('saves and consumes a protected route return path', () => {
    saveAuthReturnPath('/home', '?tab=chat');
    expect(consumeAuthReturnPath()).toBe('/home?tab=chat');
  });

  it('does not save landing or login paths', () => {
    saveAuthReturnPath(LANDING_PATH);
    saveAuthReturnPath('/login');
    expect(consumeAuthReturnPath(DEFAULT_APP_PATH)).toBe(DEFAULT_APP_PATH);
  });

  it('falls back when nothing was saved', () => {
    expect(consumeAuthReturnPath('/chat')).toBe('/chat');
  });
});
