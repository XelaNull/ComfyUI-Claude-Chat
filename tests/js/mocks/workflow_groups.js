/**
 * Mock workflow_groups module for testing
 */

export const GroupMethods = {
    createGroup: () => ({ success: true }),
    deleteGroup: () => ({ success: true }),
    updateGroup: () => ({ success: true }),
    moveNodesToGroup: () => ({ success: true }),
    mergeGroups: () => ({ success: true }),
    splitGroup: () => ({ success: true }),
    checkGroupOverlaps: () => ({ has_overlaps: false, overlapping_groups: [] })
};
