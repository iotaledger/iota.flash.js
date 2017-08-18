function deepClone(from) {
  let copy;
  if (Object.prototype.toString.call(from) === '[object Object]') {
    copy = {};
    for(const x in from) {
      copy[x] = deepClone(from[x]);
    }
  }
  else if (Array.isArray(from)) {
    let i = -1;
    copy = [];
    while (++i < from.length) {
      copy[i] = deepClone(from[i]);
    }
  }
  else {
    copy = from;
  }
  return copy;
}

module.exports = {
  deepClone
};
