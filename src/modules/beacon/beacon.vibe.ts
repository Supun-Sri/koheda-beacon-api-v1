/**
 * Jaccard Similarity (J) for vibe tag matching
 * Formula: J = |intersection| / |union|
 * Returns score between 0 and 1
 */
export interface JaccardResult {
  score: number;
  matchedTags: string[];
  passed: boolean;
}

export function jaccardSimilarity(
  consumerTags: string[],
  restaurantTags: string[]
): JaccardResult {
  const cSet = new Set(consumerTags);
  const rSet = new Set(restaurantTags);

  // Calculate intersection: tags that appear in both sets
  const intersection = [...cSet].filter(t => rSet.has(t));
  
  // Calculate union: all unique tags from both sets
  const union = new Set([...cSet, ...rSet]);

  // Jaccard score
  const score = union.size === 0 ? 0 : Math.round((intersection.length / union.size) * 1000) / 1000;

  return {
    score,
    matchedTags: intersection,
    passed: score > 0, // Vibe shield passes if there's any overlap
  };
}
