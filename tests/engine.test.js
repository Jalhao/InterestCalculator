const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const base = { initialAmount: 10000, contributionAmount: 100, contributionFrequency: 'monthly', contributionTiming: 'start', inflationRate: 0 };
const near = (a,b,tolerance=1e-6) => assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`);

test('monthly/yearly and beginning/end cash flows match closed forms', () => {
  for (const timing of ['start','end']) for (const frequency of ['monthly','yearly']) {
    const inputs = { ...base, contributionTiming: timing, contributionFrequency: frequency };
    const result = E.simulateAnnualSeries(inputs, [0.08,0.08]);
    const r = frequency === 'monthly' ? 1.08 ** (1/12) - 1 : .08;
    const count = frequency === 'monthly' ? 24 : 2;
    near(result.finalRow.endBalance, 10000*1.08**2 + 100*((1+r)**count-1)/r*(timing==='start'?1+r:1));
    near(result.moneyWeightedReturn, .08);
  }
});
test('zero return, negative return, empty principal and varying monthly path', () => {
  near(E.simulateAnnualSeries(base,[0,0]).finalRow.endBalance,12400);
  near(E.simulateAnnualSeries({...base,contributionAmount:0},[-.2]).finalRow.endBalance,8000);
  assert.equal(E.simulateAnnualSeries({...base,initialAmount:0,contributionAmount:0},[0]).moneyWeightedReturn,null);
  const upDown=E.simulateMonths({...base,initialAmount:0},[{rate:.1},{rate:-.1}]);
  const downUp=E.simulateMonths({...base,initialAmount:0},[{rate:-.1},{rate:.1}]);
  near(upDown.finalRow.endBalance,189); near(downUp.finalRow.endBalance,209);
  assert.equal(upDown.finalRow.months,2);
  assert.equal(upDown.monthlyRows.length,3);
});
test('all cash flows discounted to same purchasing power baseline', () => {
  const inputs={...base,contributionFrequency:'yearly',contributionTiming:'end',inflationRate:10};
  const row=E.simulateAnnualSeries(inputs,[0,0]).finalRow;
  near(row.realCumulativePrincipal,10000+100/1.1+100/1.1**2);
  near(row.realCumulativeProfit,10200/1.1**2-row.realCumulativePrincipal);
  near(E.simulateAnnualSeries({...inputs,contributionTiming:'start'},[0]).finalRow.realCumulativePrincipal,10100);
});
test('goal solver verifies result and handles very large and unsupported goals', () => {
  const simulate=c=>E.simulateAnnualSeries({...base,contributionAmount:c},Array(20).fill(.08));
  for(const target of [0,1e6,1e14]) {
    const result=E.solveContribution(simulate,target);
    assert.equal(result.supported,true);
    assert.ok(simulate(result.amount).finalRow.endBalance>=target);
    if(result.amount) assert.ok(simulate(result.amount-1).finalRow.endBalance<target);
  }
  assert.equal(E.solveContribution(simulate,1e15).supported,false);
  assert.equal(E.solveContribution(c=>E.simulateAnnualSeries({...base,contributionAmount:c},[0]),1e20).supported,false);
  assert.equal(E.solveContribution(c=>E.simulateMonths({...base,initialAmount:0,contributionAmount:c,contributionFrequency:'yearly',contributionTiming:'end'},[{rate:0}]),100).supported,false);
});
function payload() {
  const prices=Array.from({length:14},(_,i)=>({date:`2023-${String(i+1).padStart(2,'0')}`,close:100+i}));
  prices[12].date='2024-01'; prices[13].date='2024-02';
  return {schemaVersion:1,updatedAt:'2024-03-02T00:00:00Z',datasets:{sp500:{symbol:'^GSPC',currency:'USD',returnType:'price',prices},nasdaq100:{symbol:'^NDX',currency:'USD',returnType:'price',prices:structuredClone(prices)}}};
}
test('monthly data require continuous, closed months and correct symbols',()=>{
  const now=new Date('2024-03-03');
  const data=E.validateMarketData(payload(),now);
  const periods=E.monthlySlice(data.sp500,'2024-01','2024-02');
  near(periods[0].rate,112/111-1);
  assert.equal(periods.length,2);
  assert.throws(()=>E.monthlySlice(data.sp500,'2023-01','2024-02'));
  for(const mutate of [p=>p.datasets.sp500.prices.splice(2,1),p=>p.datasets.sp500.prices[3].date='2023-03',p=>p.datasets.sp500.prices[2].close=-1,p=>p.datasets.sp500.symbol='QQQ',p=>p.datasets.sp500.prices.at(-1).date='2024-03',p=>p.updatedAt='invalid']) {
    const p=payload(); mutate(p); assert.throws(()=>E.validateMarketData(p,now));
  }
});
