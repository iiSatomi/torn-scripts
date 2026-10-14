'use strict';

// PDA normalizes literal smart quotes before evaluation, even inside JS strings.
// Unicode escapes keep the original displayed text while surviving that rewrite.
function pdaSafeUserscriptSource(source) {
  return source.replace(/[\u2018\u2019\u201c\u201d]/g, character => '\\u' + character.charCodeAt(0).toString(16));
}

module.exports={pdaSafeUserscriptSource};
