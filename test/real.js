'use strict';

//process.env.DEBUG = '*';
// Test against data generated by running this on an x86 system
// using [gai](https://github.com/thlorenz/gai)
// Only registers (including ebp and esp) are checked, but NOT the
// memory or stack. Additional tests should take care of that.

var test = require('tape')
var fs = require('fs')
var path = require('path')
var colors = require('ansicolors')
var format = require('util').format

var ControlUnit = require('../lib/x86/cu')

function inspect(obj, depth) {
  console.error(require('util').inspect(obj, false, depth || 5, true));
}

fs
  .readdirSync(path.join(__dirname, 'fixtures'))
  .filter(function (x) { return path.extname(x) === '.json' })
  .filter(function (x) { return path.basename(x) === 'mov_reg_imd.json' })
  .forEach(runTest)

function parseOpcode(acc, instruction) {
  function parseCode(c) { return parseInt(c, 16) }
  var codes = instruction.trim().split(' ').map(parseCode);
  // concat is slow, so if we ever deal with large opcodes
  // and your tests are slowing down, copy them one by one instead
  return acc.concat(codes);
}

function getAdjusts(fixRegs, cuRegs) {
  return {
      eip : parseInt(fixRegs.eip.hex, 16) - cuRegs.eip
    , esp : parseInt(fixRegs.esp.hex, 16) - cuRegs.esp
    , ebp : parseInt(fixRegs.ebp.hex, 16) - cuRegs.ebp
  }
}

function RealTester(t, fixture) {
  if (!(this instanceof RealTester)) return new RealTester(t, fixture);

  this._t       = t;
  this._fixture = fixture;
  this._steps   = fixture.steps
  this._opcodes = fixture.opcodes.reduce(parseOpcode, [])
  this._initCu(this._opcodes)
  this._adjustRegs = getAdjusts(fixture.initialState.regs, this._cu.regs)
  inspect(this._adjustRegs)
}
var proto = RealTester.prototype;

proto.run = function run() {
  for (var i = 0, len = this._steps.length; i < len; i++)
    this._stepNcheck(this._steps[i])

  this._t.end()
}

proto._initCu = function _initCu(code) {
  var cu = new ControlUnit({ memSize: 0x1f });
  var opts = { text: code }
  this._cu = cu.init(opts);
}

proto._stepNcheck = function _stepNcheck(step) {
  // print instruction
  this._t.pass(colors.brightBlue(step.instruction))
  this._cu.next();
  this._checkRegs(step.regs)
}

proto._checkRegs = function _checkRegs(expected) {
  var self = this;
  var expectedRegs;
  function pullHex(acc, r) {
    acc[r] = parseInt(expected[r].hex, 16);
    return acc;
  }

  function checkReg(r) {
    var expect = expectedRegs[r];
    if (self._adjustRegs[r]) expect = expect - self._adjustRegs[r];
    var act = self._cu.regs[r];
    self._t.pass(format('%s: 0x%s === 0x%s', r, act.toString(16), expect.toString(16)))
  }

  expectedRegs = Object.keys(expected).reduce(pullHex, {});
  Object.keys(expectedRegs).forEach(checkReg)
}

function runTest(jsonFile) {
  test('\ngai ' + jsonFile, function (t) {
    new RealTester(t, require('./fixtures/' + jsonFile)).run()
  })
}