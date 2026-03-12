class ZSet {
  constructor() {
    // Map<member, {member, score}> — same object ref lives in sorted[]
    this.members = new Map();
    this.sorted = [];
    this._dirty = false;
  }

  _ensureSorted() {
    if (this._dirty) {
      this.sorted.sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));
      this._dirty = false;
    }
  }

  // Binary search for the index of a member in the sorted array.
  // Requires _ensureSorted() to have been called first.
  _indexOf(member, score) {
    const arr = this.sorted;
    let lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const cmp = arr[mid].score - score || arr[mid].member.localeCompare(member);
      if (cmp < 0) lo = mid + 1;
      else if (cmp > 0) hi = mid - 1;
      else return mid;
    }
    return -1;
  }

  zadd(member, score) {
    const entry = this.members.get(member);
    if (entry !== undefined) {
      entry.score = score;
      this._dirty = true;
      return 0;
    }
    const obj = { member, score };
    this.members.set(member, obj);
    this.sorted.push(obj);
    this._dirty = true;
    return 1;
  }

  zincrby(member, increment) {
    const entry = this.members.get(member);
    if (entry !== undefined) {
      entry.score += increment;
      this._dirty = true;
      return entry.score;
    }
    const newScore = increment;
    const obj = { member, score: newScore };
    this.members.set(member, obj);
    this.sorted.push(obj);
    this._dirty = true;
    return newScore;
  }

  zscore(member) {
    const entry = this.members.get(member);
    return entry !== undefined ? entry.score : null;
  }

  zrank(member) {
    const entry = this.members.get(member);
    if (entry === undefined) return null;
    this._ensureSorted();
    return this._indexOf(member, entry.score);
  }

  zrevrank(member) {
    const rank = this.zrank(member);
    return rank === null ? null : this.sorted.length - 1 - rank;
  }

  zrange(start, stop) {
    this._ensureSorted();
    if (stop < 0) stop = this.sorted.length + stop;
    return this.sorted.slice(start, stop + 1).map(e => ({ member: e.member, score: e.score }));
  }

  zrevrange(start, stop) {
    this._ensureSorted();
    const rev = [...this.sorted].reverse();
    if (stop < 0) stop = rev.length + stop;
    return rev.slice(start, stop + 1).map(e => ({ member: e.member, score: e.score }));
  }

  zrangebyscore(min, max) {
    this._ensureSorted();
    // Binary search for the first entry with score >= min
    const arr = this.sorted;
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid].score < min) lo = mid + 1;
      else hi = mid;
    }
    const result = [];
    for (let i = lo; i < arr.length; i++) {
      if (arr[i].score > max) break;
      result.push({ member: arr[i].member, score: arr[i].score });
    }
    return result;
  }

  zrem(member) {
    const entry = this.members.get(member);
    if (entry === undefined) return 0;
    this.members.delete(member);
    // Find in sorted array — use binary search if sorted, else linear
    if (!this._dirty) {
      const idx = this._indexOf(member, entry.score);
      if (idx !== -1) this.sorted.splice(idx, 1);
    } else {
      const idx = this.sorted.indexOf(entry);
      if (idx !== -1) this.sorted.splice(idx, 1);
    }
    return 1;
  }

  zcard() {
    return this.members.size;
  }

  zcount(min, max) {
    this._ensureSorted();
    const arr = this.sorted;
    // Binary search for first entry with score >= min
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid].score < min) lo = mid + 1;
      else hi = mid;
    }
    let count = 0;
    for (let i = lo; i < arr.length; i++) {
      if (arr[i].score > max) break;
      count++;
    }
    return count;
  }
}

module.exports = { ZSet };
