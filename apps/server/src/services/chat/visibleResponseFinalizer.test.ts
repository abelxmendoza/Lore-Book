import { describe, expect, it } from 'vitest';
import { responseCompilerService } from '../responseCompiler/responseCompilerService';
import {
  finalizeVisibleAssistantResponse,
  toChatStreamDoneFields,
} from './visibleResponseFinalizer';

function compileVisible(rawResponse: string, userMessage: string, userId = 'user-a') {
  return responseCompilerService.compile({
    userId,
    rawResponse,
    sourceMessages: [{ id: 'm1', role: 'user', content: userMessage }],
  });
}

describe('visibleResponseFinalizer', () => {
  it('rewrites interpretation as the user\'s belief, not another person\'s internal state', () => {
    const draft =
      'Maya overheard a conversation, which contributed to her discomfort and feelings of jealousy.';
    const source = 'I think Maya was jealous when she saw me talking with Priya.';
    const finalization = finalizeVisibleAssistantResponse({
      draftContent: draft,
      compiled: compileVisible(draft, source),
    });
    expect(finalization.rewritten).toBe(true);
    expect(finalization.verified).toBe(true);
    expect(finalization.finalContent.toLowerCase()).not.toMatch(/her discomfort and feelings of jealousy/);
    expect(finalization.finalContent).toMatch(/user believed/i);
    expect(finalization.epistemicRewriteCount).toBeGreaterThan(0);
    expect(finalization.finalContent).toBe(toChatStreamDoneFields(finalization).content);
  });

  it('rewrites unsupported causality instead of inventing a causal bridge', () => {
    const draft = 'She overheard us, which contributed to the confrontation.';
    const source = 'She overheard us. Later she confronted me.';
    const finalization = finalizeVisibleAssistantResponse({
      draftContent: draft,
      compiled: compileVisible(draft, source),
    });
    expect(finalization.rewritten).toBe(true);
    expect(finalization.finalContent.toLowerCase()).not.toMatch(/contributed to/);
    expect(finalization.causalRewriteCount).toBeGreaterThan(0);
  });

  it('downgrades unsupported embellishment', () => {
    const draft = 'Maya, a prominent member of the ska scene, was there.';
    const source = 'Maya is part of the scene.';
    const finalization = finalizeVisibleAssistantResponse({
      draftContent: draft,
      compiled: compileVisible(draft, source),
    });
    expect(finalization.rewritten).toBe(true);
    expect(finalization.finalContent.toLowerCase()).not.toMatch(/prominent/);
    expect(finalization.embellishmentRewriteCount).toBeGreaterThan(0);
  });

  it('keeps fear from becoming a confirmed event', () => {
    const draft = "The user's reputation spread to the new club.";
    const source = 'I fear people at the new club heard about me.';
    const finalization = finalizeVisibleAssistantResponse({
      draftContent: draft,
      compiled: compileVisible(draft, source),
    });
    expect(finalization.rewritten).toBe(true);
    expect(finalization.finalContent).toMatch(/worried/i);
    expect(finalization.epistemicRewriteCount).toBeGreaterThan(0);
  });

  it('keeps a third-party allegation from becoming a fact about the named person', () => {
    const draft = 'Rowan is a liar.';
    const source = 'People called Rowan a liar.';
    const finalization = finalizeVisibleAssistantResponse({
      draftContent: draft,
      compiled: compileVisible(draft, source),
    });
    expect(finalization.rewritten).toBe(true);
    expect(finalization.finalContent).toMatch(/people called Rowan a liar/i);
    expect(finalization.epistemicRewriteCount).toBeGreaterThan(0);
  });

  it('is a no-op when the draft is already grounded', () => {
    const draft = 'Maya said she felt uncomfortable.';
    const source = 'Maya said she felt uncomfortable.';
    const finalization = finalizeVisibleAssistantResponse({
      draftContent: draft,
      compiled: compileVisible(draft, source),
    });
    expect(finalization.rewritten).toBe(false);
    expect(finalization.finalContent).toBe(draft);
    expect(finalization.verified).toBe(true);
    expect(toChatStreamDoneFields(finalization).content).toBeUndefined();
  });

  it('keeps the streamed draft and marks verification degraded when compile fails', () => {
    const draft = 'Maya was jealous, which contributed to the split.';
    const finalization = finalizeVisibleAssistantResponse({
      draftContent: draft,
      compiled: null,
      verificationFailed: true,
    });
    expect(finalization.finalContent).toBe(draft);
    expect(finalization.rewritten).toBe(false);
    expect(finalization.verified).toBe(false);
    expect(finalization.verificationDegraded).toBe(true);
    expect(toChatStreamDoneFields(finalization).content).toBeUndefined();
    expect(toChatStreamDoneFields(finalization).verificationDegraded).toBe(true);
  });

  it('uses one finalContent for the persisted message and the visible done payload', () => {
    const draft =
      'Maya overheard a conversation, which contributed to her discomfort and feelings of jealousy.';
    const source = 'I think Maya was jealous when she saw me talking with Priya.';
    const finalization = finalizeVisibleAssistantResponse({
      draftContent: draft,
      compiled: compileVisible(draft, source),
    });
    const done = toChatStreamDoneFields(finalization);
    expect(finalization.rewritten).toBe(true);
    expect(done.content).toBe(finalization.finalContent);
    expect(done.content).not.toBe(draft);
  });

  it('does not leak another tenant\'s source text into the rewrite', () => {
    const draftA = 'Maya was jealous.';
    const sourceA = 'I think Maya was jealous.';
    const draftB = 'Jamie works at Vanguard Robotics.';
    const sourceB = 'Jamie is my coworker at Vanguard Robotics.';
    const a = finalizeVisibleAssistantResponse({
      draftContent: draftA,
      compiled: compileVisible(draftA, sourceA, 'user-a'),
    });
    const b = finalizeVisibleAssistantResponse({
      draftContent: draftB,
      compiled: compileVisible(draftB, sourceB, 'user-b'),
    });
    expect(a.finalContent.toLowerCase()).not.toMatch(/vanguard/);
    expect(b.finalContent.toLowerCase()).not.toMatch(/jealous/);
    expect(a.finalContent).not.toBe(b.finalContent);
  });
});
