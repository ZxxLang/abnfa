let decoder = {
  INT: {
    2: function(s) {
      return parseInt(s, 2);
    },
    8: function(s) {
      return parseInt(s, 8);
    },
    10: function(s) {
      return parseInt(s, 10);
    },
    16: function(s) {
      return parseInt(s, 16);
    },
    LE: function(bytes) {

    },
    BE: function(bytes) {

    },
    ME: function(bytes) {

    }
  },
  RUNE: {
    16: function(s) {
      return parseInt(s, 16);
    }
  },
  FLOAT: {
    default: function() {
    },
    binary: function() {
    }
  },
  STRING: {
    unescape: function(s) {
      // \ ' " / b f n r t u
      return JSON.parse('"' + s + '"');
    },
    trim: function(s) {
      return s.trim();
    }
  },
  TIME: {
    ISO8601: function(x) {
      return x;
    }
  }
};

module.exports = decoder;
