import test from 'node:test';
import assert from 'node:assert/strict';
import {rainwearExpected} from '../public/rain.mjs';
test('rain on selected school day generates a rainwear reminder',()=>{
 assert.equal(rainwearExpected({rainMm:0.1,symbol:'cloudy'}),true);
 assert.equal(rainwearExpected({rainMm:0,symbol:'rainshowers_day'}),true);
 assert.equal(rainwearExpected({symbol:'sleet'}),true);
 assert.equal(rainwearExpected({rainMm:0,symbol:'clearsky_day'}),false);
 assert.equal(rainwearExpected({rainMm:null,symbol:null}),false);
 assert.equal(rainwearExpected(null),false);
 assert.equal(rainwearExpected({rainMm:'1.5',symbol:'fair_day'}),false);
});
