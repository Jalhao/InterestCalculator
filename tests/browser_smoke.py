"""Functional browser checks. Run a static server on 127.0.0.1:8000 first.
Market responses below are synthetic test fixtures, never published as real data.
"""
import csv
import io
import json
import os
from pathlib import Path
import re
from playwright.sync_api import sync_playwright


def money(page, selector):
    return float(re.sub(r'[^0-9.\-]', '', page.locator(selector).inner_text()))


def fixture():
    prices = [{'date':'2022-12','close':100}]
    value=100
    for year, months in [(2023,range(1,13)),(2024,range(1,13)),(2025,[1])]:
        for month in months:
            value *= 1.1 if month%2 else .9
            prices.append({'date':f'{year}-{month:02d}','close':value})
    return {'schemaVersion':1,'updatedAt':'2025-02-03T00:00:00Z','datasets':{
        key:{'symbol':symbol,'source':'Synthetic test fixture','currency':'USD','returnType':'price','prices':prices}
        for key,symbol in [('sp500','^GSPC'),('nasdaq100','^NDX')]
    }}


with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium') or None,headless=True)
    errors=[]
    page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/data/market-data.json*',lambda route:route.fulfill(status=503,body='test unavailable'))
    page.goto('http://127.0.0.1:8000/',wait_until='networkidle')
    r=1.08**(1/12)-1
    expected=100000*1.08**20+2000*(1+r)*((1+r)**240-1)/r
    assert abs(money(page,'#metricFinalValue')-expected)<1
    assert page.locator('#yearlyTableBody tr').count()==20
    page.locator('#annualRate').fill('');page.locator('#annualRate').press_sequentially('8.5')
    assert page.locator('#annualRate').input_value()=='8.5'
    page.locator('#years').fill('');assert page.locator('#years').input_value()==''
    page.locator('#annualRate').click();assert page.locator('#years').input_value()=='20'
    page.locator('#annualRate').fill('999');page.locator('#initialAmount').click()
    assert page.locator('#annualRate').input_value()=='80'
    print('PASS: independent default formula, decimal/empty editing and bounds')
    page.locator('#reset-button').click()
    for key,value in [('initialAmount','10000'),('years','2'),('contributionAmount','100'),('annualRate','0'),('inflationRate','10'),('targetAmount','12400')]:
        page.locator('#'+key).fill(value)
    assert money(page,'#metricFinalValue')==12400
    nominal=money(page,'#goalRequiredContribution')
    page.locator('#targetBasis').select_option('real')
    assert money(page,'#goalRequiredContribution')>nominal
    assert '购买力' in page.locator('#goalTargetCaption').inner_text()
    with page.expect_download() as info:page.locator('#exportButton').click()
    text=Path(info.value.path()).read_text(encoding='utf-8-sig')
    rows=list(csv.reader(io.StringIO(text)))
    assert float(rows[2][7])==12400
    assert 'targetBasis' in text and '行情抓取时间' in text
    page.locator('#targetAmount').fill('1000000000000000')
    assert page.locator('#goalRequiredContribution').inner_text()=='超出范围'
    page.locator('#showTargetLine').uncheck()
    assert page.locator('.target-line').count()==0
    page.locator('#chartSurface').focus();page.keyboard.press('End')
    assert page.locator('#chartTooltip').is_visible()
    page.keyboard.press('Escape');assert page.locator('#chartTooltip').is_hidden()
    print('PASS: real/nominal goals, large goal rejection, CSV metadata and keyboard chart')
    page.locator('#reset-button').click()
    page.locator('#planName').fill('<img src=x onerror=alert(1)>')
    page.locator('#savePlan').click()
    assert page.locator('#planList img').count()==0
    page.locator('#initialAmount').fill('250000')
    page.reload(wait_until='networkidle');assert page.locator('#initialAmount').input_value()=='250000'
    page.locator('#planList button').first.click();assert page.locator('#initialAmount').input_value()=='100000'
    page.context.grant_permissions(['clipboard-read','clipboard-write'])
    page.locator('#sharePlan').click();page.wait_for_timeout(100)
    shared=page.locator('#shareUrl').input_value() if page.locator('#shareUrl').is_visible() else page.evaluate("async () => await navigator.clipboard.readText()")
    other=browser.new_page();other.goto(shared,wait_until='networkidle')
    assert other.locator('#initialAmount').input_value()=='100000';other.close()
    page.locator('[data-group="calculationMode"] [data-value="backtest"]').click()
    assert '年度' in page.locator('#dataStatus').inner_text()
    page.locator('#years').fill('1');page.locator('#backtestStartYear').select_option('2010')
    page.locator('#initialAmount').fill('10000');page.locator('#contributionAmount').fill('0')
    for key,rate in [('sp500',.1506),('nasdaq100',.192),('csi300',-.1251)]:
        page.locator('#backtestDataset').select_option(key)
        assert abs(money(page,'#metricFinalValue')-10000*(1+rate))<1
    page.locator('#backtestStartYear').select_option('2015')
    page.reload(wait_until='networkidle')
    assert page.locator('#backtestStartYear').input_value()=='2015'
    print('PASS: local plans, escaped names, parameter persistence/share and annual fallback')
    page.close()
    # Fresh storage context and a complete month-price fixture.
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/data/market-data.json*',lambda route:route.fulfill(json=fixture()))
    page.goto('http://127.0.0.1:8000/',wait_until='networkidle')
    page.locator('[data-group="calculationMode"] [data-value="backtest"]').click()
    assert page.locator('#monthlyRange').is_visible()
    assert '已滞后' in page.locator('#dataStatus').inner_text()
    page.locator('#backtestStartMonth').fill('2023-01');page.locator('#backtestStartMonth').dispatch_event('change');page.locator('#backtestEndMonth').fill('2023-02');page.locator('#backtestEndMonth').dispatch_event('change')
    page.locator('#initialAmount').fill('0');page.locator('#contributionAmount').fill('100')
    assert money(page,'#metricFinalValue')==189
    assert page.locator('#yearlyTableBody tr').count()==1
    page.locator('[data-group="contributionTiming"] [data-value="end"]').click()
    assert money(page,'#metricFinalValue')==190
    page.locator('#backtestDataset').select_option('nasdaq100')
    assert money(page,'#metricFinalValue')==190
    page.locator('#targetBasis').select_option('real');page.locator('#inflationRate').fill('0')
    page.locator('#targetAmount').fill('50')
    assert page.locator('#goalHitTime').inner_text()=='2023-01'
    page.locator('#backtestEndMonth').fill('2024-01');page.locator('#backtestEndMonth').dispatch_event('change')
    assert page.locator('#yearlyTableBody tr').count()==2
    assert page.locator('#yearlyTableBody tr').last.locator('td').first.inner_text()=='2024-01—2024-01'
    page.locator('#planName').fill('月度路径');page.locator('#savePlan').click()
    assert '暂不比较' not in page.locator('#planList').inner_text()
    # A refresh failure preserves validated cached data rather than falling back silently.
    page.unroute('**/data/market-data.json*')
    page.route('**/data/market-data.json*',lambda route:route.fulfill(status=503,body='unavailable'))
    page.locator('#refreshData').click();page.wait_for_timeout(150)
    assert '继续使用已验证缓存' in page.locator('#dataStatus').inner_text()
    assert page.locator('#monthlyRange').is_visible()
    page.reload(wait_until='networkidle')
    assert page.locator('#monthlyRange').is_visible()
    page.set_viewport_size({'width':390,'height':844})
    assert page.locator('#initialAmount').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert not errors,errors
    print('PASS: real monthly paths, partial years, first goal month, refresh/cache recovery and mobile layout')
    context.close();browser.close()
