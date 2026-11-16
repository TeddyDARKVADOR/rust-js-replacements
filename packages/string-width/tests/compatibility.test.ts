import { stringWidth, stringWidthMany } from '../src/index.ts';
import { defineCompatibilitySuite } from './compatibility-suite.ts';

defineCompatibilitySuite('native addon', stringWidth, stringWidthMany);
