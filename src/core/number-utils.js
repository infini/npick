export const LOTTO_MIN_NUMBER = 1;
export const LOTTO_MAX_NUMBER = 45;
export const LOTTO_PICK_COUNT = 6;

export function createNumberRange(min = LOTTO_MIN_NUMBER, max = LOTTO_MAX_NUMBER) {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

export function normalize(value, min, max) {
  if (max === min) {
    return 0.5;
  }
  return (value - min) / (max - min);
}

export function quantile(sortedValues, ratio) {
  if (!sortedValues.length) {
    return null;
  }
  return sortedValues[Math.floor((sortedValues.length - 1) * ratio)];
}

export function sum(numbers) {
  return numbers.reduce((acc, number) => acc + number, 0);
}

export function countMatches(numbers, targetSet) {
  return numbers.filter((number) => targetSet.has(number)).length;
}

export function bucketCounts(numbers) {
  const buckets = [0, 0, 0, 0, 0];
  numbers.forEach((number) => {
    buckets[Math.min(4, Math.floor((number - 1) / 10))] += 1;
  });
  return buckets;
}

export function longestConsecutiveRun(numbers) {
  let longest = 1;
  let current = 1;

  for (let index = 1; index < numbers.length; index += 1) {
    if (numbers[index] === numbers[index - 1] + 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}
