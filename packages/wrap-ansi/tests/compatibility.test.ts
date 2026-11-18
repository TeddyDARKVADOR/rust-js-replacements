import { wrapAnsi } from '../src/index.ts';
import { defineCompatibilitySuite } from './compatibility-suite.ts';
import { loadBinding } from './helpers.ts';

const binding = loadBinding();

defineCompatibilitySuite('native addon', wrapAnsi, () => binding);
