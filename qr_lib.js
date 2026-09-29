/**
 * Lightweight, zero-dependency, self-contained QR Code Generator
 * Based on Kazuhiko Arase's QR Code specification (ISO/IEC 18004).
 * Generates valid, scannable QR Code SVG and module matrices.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory();
  } else {
    root.CaloriqQR = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // QR Mode constants
  var QRMode = {
    MODE_NUMBER: 1 << 0,
    MODE_ALPHA_NUM: 1 << 1,
    MODE_8BIT_BYTE: 1 << 2,
    MODE_KANJI: 1 << 3
  };

  // Error Correction Levels
  var QRErrorCorrectLevel = {
    L: 1,
    M: 0,
    Q: 3,
    H: 2
  };

  // QR Mask Patterns
  var QRMaskPattern = {
    PATTERN000: 0,
    PATTERN001: 1,
    PATTERN010: 2,
    PATTERN011: 3,
    PATTERN100: 4,
    PATTERN101: 5,
    PATTERN110: 6,
    PATTERN111: 7
  };

  // Galois Field Math
  var QRMath = {
    glog: function (n) {
      if (n < 1) throw new Error("glog(" + n + ")");
      return QRMath.LOG_TABLE[n];
    },
    gexp: function (n) {
      while (n < 0) n += 255;
      while (n >= 255) n -= 255;
      return QRMath.EXP_TABLE[n];
    },
    EXP_TABLE: new Array(256),
    LOG_TABLE: new Array(256)
  };

  for (var i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
  for (var i = 8; i < 256; i++) {
    QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
  }
  for (var i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

  // QR Polynomial
  function QRPolynomial(num, shift) {
    if (num.length === undefined) throw new Error(num.length + "/" + shift);
    var offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (var i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    for (var i = num.length - offset; i < this.num.length; i++) this.num[i] = 0;
  }

  QRPolynomial.prototype = {
    get: function (index) { return this.num[index]; },
    getLength: function () { return this.num.length; },
    multiply: function (e) {
      var num = new Array(this.getLength() + e.getLength() - 1);
      for (var i = 0; i < this.getLength(); i++) {
        for (var j = 0; j < e.getLength(); j++) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
        }
      }
      return new QRPolynomial(num, 0);
    },
    mod: function (e) {
      if (this.getLength() - e.getLength() < 0) return this;
      var ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
      var num = new Array(this.getLength());
      for (var i = 0; i < this.getLength(); i++) num[i] = this.get(i);
      for (var i = 0; i < e.getLength(); i++) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
      }
      return new QRPolynomial(num, 0).mod(e);
    }
  };

  // QR RS Block Table
  var RS_BLOCK_TABLE = [
    [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9], // v1
    [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16], // v2
    [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13], // v3
    [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],  // v4
    [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12], // v5
    [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15], // v6
    [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14], // v7
    [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15], // v8
    [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13], // v9
    [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16] // v10
  ];

  function QRRSBlock(totalCount, dataCount) {
    this.totalCount = totalCount;
    this.dataCount = dataCount;
  }

  QRRSBlock.getRSBlocks = function (typeNumber, errorCorrectLevel) {
    var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
    if (!rsBlock) throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
    var length = rsBlock.length / 3;
    var list = [];
    for (var i = 0; i < length; i++) {
      var count = rsBlock[i * 3 + 0];
      var totalCount = rsBlock[i * 3 + 1];
      var dataCount = rsBlock[i * 3 + 2];
      for (var j = 0; j < count; j++) {
        list.push(new QRRSBlock(totalCount, dataCount));
      }
    }
    return list;
  };

  QRRSBlock.getRsBlockTable = function (typeNumber, errorCorrectLevel) {
    switch (errorCorrectLevel) {
      case QRErrorCorrectLevel.L: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectLevel.M: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectLevel.Q: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectLevel.H: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default: return undefined;
    }
  };

  // QR Bit Buffer
  function QRBitBuffer() {
    this.buffer = [];
    this.length = 0;
  }

  QRBitBuffer.prototype = {
    get: function (index) {
      var bufIndex = Math.floor(index / 8);
      return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) === 1;
    },
    put: function (num, length) {
      for (var i = 0; i < length; i++) {
        this.putBit(((num >>> (length - i - 1)) & 1) === 1);
      }
    },
    putBit: function (bit) {
      var bufIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufIndex) this.buffer.push(0);
      if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
      this.length++;
    }
  };

  // 8BitByte Data
  function QR8BitByte(data) {
    this.mode = QRMode.MODE_8BIT_BYTE;
    this.data = data;
  }

  QR8BitByte.prototype = {
    getLength: function () {
      return encodeURI(this.data).replace(/%[0-9a-fA-F]{2}/g, 'a').length;
    },
    write: function (buffer) {
      for (var i = 0; i < this.data.length; i++) {
        var c = this.data.charCodeAt(i);
        if (c < 128) {
          buffer.put(c, 8);
        } else if (c < 2048) {
          buffer.put((c >> 6) | 192, 8);
          buffer.put((c & 63) | 128, 8);
        } else {
          buffer.put((c >> 12) | 224, 8);
          buffer.put(((c >> 6) & 63) | 128, 8);
          buffer.put((c & 63) | 128, 8);
        }
      }
    }
  };

  // QR Utility functions
  var QRUtil = {
    PATTERN_POSITION_TABLE: [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54]
    ],
    G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18: (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
    getBCHTypeInfo: function (data) {
      var d = data << 10;
      while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
        d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15)));
      }
      return ((data << 10) | d) ^ QRUtil.G15_MASK;
    },
    getBCHDigit: function (data) {
      var digit = 0;
      while (data !== 0) {
        digit++;
        data >>>= 1;
      }
      return digit;
    },
    getPatternPosition: function (typeNumber) {
      return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },
    getMask: function (maskPattern, i, j) {
      switch (maskPattern) {
        case QRMaskPattern.PATTERN000: return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001: return i % 2 === 0;
        case QRMaskPattern.PATTERN010: return j % 3 === 0;
        case QRMaskPattern.PATTERN011: return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
        case QRMaskPattern.PATTERN101: return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110: return ((i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111: return ((i * j) % 3 + (i + j) % 2) % 2 === 0;
        default: throw new Error("bad maskPattern:" + maskPattern);
      }
    },
    getErrorCorrectPolynomial: function (errorCorrectLength) {
      var a = new QRPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i++) {
        a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
      }
      return a;
    },
    getLengthInBits: function (mode, type) {
      if (1 <= type && type < 10) {
        switch (mode) {
          case QRMode.MODE_NUMBER: return 10;
          case QRMode.MODE_ALPHA_NUM: return 9;
          case QRMode.MODE_8BIT_BYTE: return 8;
          case QRMode.MODE_KANJI: return 8;
          default: throw new Error("mode:" + mode);
        }
      } else {
        switch (mode) {
          case QRMode.MODE_NUMBER: return 12;
          case QRMode.MODE_ALPHA_NUM: return 11;
          case QRMode.MODE_8BIT_BYTE: return 16;
          case QRMode.MODE_KANJI: return 10;
          default: throw new Error("mode:" + mode);
        }
      }
    }
  };

  // QRCode Model
  function QRCode(typeNumber, errorCorrectLevel) {
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = errorCorrectLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataCache = null;
    this.dataList = [];
  }

  QRCode.prototype = {
    addData: function (data) {
      this.dataList.push(new QR8BitByte(data));
      this.dataCache = null;
    },
    isDark: function (row, col) {
      if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
        throw new Error(row + "," + col);
      }
      return this.modules[row][col];
    },
    getModuleCount: function () {
      return this.moduleCount;
    },
    make: function () {
      if (this.typeNumber < 1) {
        var typeNumber = 1;
        for (typeNumber = 1; typeNumber < 10; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);
          var buffer = new QRBitBuffer();
          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }
          for (var i = 0; i < this.dataList.length; i++) {
            var data = this.dataList[i];
            buffer.put(data.mode, 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
            data.write(buffer);
          }
          if (buffer.length <= totalDataCount * 8) break;
        }
        this.typeNumber = typeNumber;
      }
      this.makeImpl(false, this.getBestMaskPattern());
    },
    makeImpl: function (test, maskPattern) {
      this.moduleCount = this.typeNumber * 4 + 17;
      this.modules = new Array(this.moduleCount);
      for (var row = 0; row < this.moduleCount; row++) {
        this.modules[row] = new Array(this.moduleCount);
        for (var col = 0; col < this.moduleCount; col++) {
          this.modules[row][col] = null;
        }
      }
      this.setupPositionProbePattern(0, 0);
      this.setupPositionProbePattern(this.moduleCount - 7, 0);
      this.setupPositionProbePattern(0, this.moduleCount - 7);
      this.setupPositionAdjustPattern();
      this.setupTimingPattern();
      this.setupTypeInfo(test, maskPattern);
      if (this.dataCache == null) {
        this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
      }
      this.mapData(this.dataCache, maskPattern);
    },
    setupPositionProbePattern: function (row, col) {
      for (var r = -1; r <= 7; r++) {
        if (row + r <= -1 || this.moduleCount <= row + r) continue;
        for (var c = -1; c <= 7; c++) {
          if (col + c <= -1 || this.moduleCount <= col + c) continue;
          if ((0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
            this.modules[row + r][col + c] = true;
          } else {
            this.modules[row + r][col + c] = false;
          }
        }
      }
    },
    getBestMaskPattern: function () {
      var minLostPoint = 0;
      var pattern = 0;
      for (var i = 0; i < 8; i++) {
        this.makeImpl(true, i);
        var lostPoint = QRUtil.getLostPoint ? QRUtil.getLostPoint(this) : 0;
        if (i === 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }
      return pattern;
    },
    setupTimingPattern: function () {
      for (var r = 8; r < this.moduleCount - 8; r++) {
        if (this.modules[r][6] !== null) continue;
        this.modules[r][6] = (r % 2 === 0);
      }
      for (var c = 8; c < this.moduleCount - 8; c++) {
        if (this.modules[6][c] !== null) continue;
        this.modules[6][c] = (c % 2 === 0);
      }
    },
    setupPositionAdjustPattern: function () {
      var pos = QRUtil.getPatternPosition(this.typeNumber);
      if (!pos) return;
      for (var i = 0; i < pos.length; i++) {
        for (var j = 0; j < pos.length; j++) {
          var row = pos[i];
          var col = pos[j];
          if (this.modules[row][col] !== null) continue;
          for (var r = -2; r <= 2; r++) {
            for (var c = -2; c <= 2; c++) {
              if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) {
                this.modules[row + r][col + c] = true;
              } else {
                this.modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    },
    setupTypeInfo: function (test, maskPattern) {
      var data = (this.errorCorrectLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);
      for (var i = 0; i < 15; i++) {
        var mod = (!test && ((bits >> i) & 1) === 1);
        if (i < 6) this.modules[i][8] = mod;
        else if (i < 8) this.modules[i + 1][8] = mod;
        else this.modules[this.moduleCount - 15 + i][8] = mod;

        if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
        else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
        else this.modules[8][15 - i - 1] = mod;
      }
      this.modules[this.moduleCount - 8][8] = !test;
    },
    mapData: function (data, maskPattern) {
      var inc = -1;
      var row = this.moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      for (var col = this.moduleCount - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        while (true) {
          for (var c = 0; c < 2; c++) {
            if (this.modules[row][col - c] === null) {
              var dark = false;
              if (byteIndex < data.length) {
                dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
              }
              var mask = QRUtil.getMask(maskPattern, row, col - c);
              if (mask) dark = !dark;
              this.modules[row][col - c] = dark;
              bitIndex--;
              if (bitIndex === -1) {
                byteIndex++;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || this.moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    }
  };

  QRCode.createData = function (typeNumber, errorCorrectLevel, dataList) {
    var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
    var buffer = new QRBitBuffer();
    for (var i = 0; i < dataList.length; i++) {
      var data = dataList[i];
      buffer.put(data.mode, 4);
      buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
      data.write(buffer);
    }
    var totalDataCount = 0;
    for (var i = 0; i < rsBlocks.length; i++) {
      totalDataCount += rsBlocks[i].dataCount;
    }
    if (buffer.length > totalDataCount * 8) {
      throw new Error("code length overflow. (" + buffer.length + ">" + totalDataCount * 8 + ")");
    }
    if (buffer.length + 4 <= totalDataCount * 8) buffer.put(0, 4);
    while (buffer.length % 8 !== 0) buffer.putBit(false);
    while (true) {
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(0xec, 8);
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(0x11, 8);
    }
    return QRCode.createBytes(buffer, rsBlocks);
  };

  QRCode.createBytes = function (buffer, rsBlocks) {
    var offset = 0;
    var maxDcCount = 0;
    var maxEcCount = 0;
    var dcdata = new Array(rsBlocks.length);
    var ecdata = new Array(rsBlocks.length);
    for (var r = 0; r < rsBlocks.length; r++) {
      var dcCount = rsBlocks[r].dataCount;
      var ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = new Array(dcCount);
      for (var i = 0; i < dcdata[r].length; i++) {
        dcdata[r][i] = 0xff & buffer.buffer[i + offset];
      }
      offset += dcCount;
      var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
      var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
      var modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (var i = 0; i < ecdata[r].length; i++) {
        var modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
      }
    }
    var totalCodeCount = 0;
    for (var i = 0; i < rsBlocks.length; i++) {
      totalCodeCount += rsBlocks[i].totalCount;
    }
    var data = new Array(totalCodeCount);
    var index = 0;
    for (var i = 0; i < maxDcCount; i++) {
      for (var r = 0; r < rsBlocks.length; r++) {
        if (i < dcdata[r].length) data[index++] = dcdata[r][i];
      }
    }
    for (var i = 0; i < maxEcCount; i++) {
      for (var r = 0; r < rsBlocks.length; r++) {
        if (i < ecdata[r].length) data[index++] = ecdata[r][i];
      }
    }
    return data;
  };

  /**
   * Generates a clean, crisp SVG string for the QR code.
   */
  function generateQRCodeSVG(text, size, margin) {
    size = size || 240;
    margin = (margin === undefined) ? 4 : margin;

    var qr = new QRCode(-1, QRErrorCorrectLevel.M);
    qr.addData(text);
    qr.make();

    var count = qr.getModuleCount();
    var fullCount = count + margin * 2;
    var cellSize = (size / fullCount).toFixed(3);

    var pathData = [];
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          var x = ((c + margin) * cellSize).toFixed(2);
          var y = ((r + margin) * cellSize).toFixed(2);
          pathData.push("M" + x + "," + y + "h" + cellSize + "v" + cellSize + "h-" + cellSize + "z");
        }
      }
    }

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges">';
    svg += '<rect width="100%" height="100%" fill="#ffffff" />';
    svg += '<path d="' + pathData.join(" ") + '" fill="#000000" />';
    svg += '</svg>';
    return svg;
  }

  return {
    QRCode: QRCode,
    QRErrorCorrectLevel: QRErrorCorrectLevel,
    generateQRCodeSVG: generateQRCodeSVG
  };
});
