/**
 * Community detection — separate from narrative anchors.
 */

export type CommunityClusterType =
  | 'HOUSEHOLD'
  | 'FAMILY_GROUP'
  | 'ORGANIZATION'
  | 'SOCIAL_CIRCLE'
  | 'SCENE'
  | 'WORK_TEAM';

export type CommunityCluster = {
  id: string;
  type: CommunityClusterType;
  name: string;
  memberNames: string[];
  relatedEventTitles: string[];
  placeNames: string[];
  confidence: number;
  evidenceLabels: string[];
  sourceAnchorId?: string;
};
