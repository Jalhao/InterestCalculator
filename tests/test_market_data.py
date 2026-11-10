import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('updater', Path(__file__).resolve().parents[1] / 'scripts/update_market_data.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


def fixture(symbol='^GSPC'):
    timestamps, closes = [], []
    for year, months in [(2023, range(1,13)), (2024, range(1,4))]:
        for month in months:
            date = dt.datetime(year, month+1, 1, tzinfo=dt.timezone.utc) if month < 12 else dt.datetime(year+1,1,1,tzinfo=dt.timezone.utc)
            last = date - dt.timedelta(days=1) + dt.timedelta(hours=21)
            timestamps.append(int(last.timestamp()))
            closes.append(100+len(closes))
    return {'chart': {'error': None, 'result': [{'meta': {'symbol':symbol}, 'timestamp':timestamps, 'indicators':{'quote':[{'close':closes}]}}]}}


class MarketDataTest(unittest.TestCase):
    def test_completed_months_and_index_prices(self):
        prices = updater.extract_prices(fixture(), '^GSPC', dt.datetime(2024,3,10,tzinfo=dt.timezone.utc))
        self.assertEqual(len(prices),14)
        self.assertEqual(prices[-1]['date'],'2024-02')
        self.assertEqual(prices[-1]['asOf'],'2024-02-29')
        self.assertEqual(prices[-1]['close'],113)

    def test_reject_errors_gaps_stale_and_incomplete(self):
        for mutation in [
            lambda r:r['meta'].update(symbol='QQQ'),
            lambda r:r['indicators']['quote'][0]['close'].__setitem__(3,None),
            lambda r:r['indicators']['quote'][0]['close'].__setitem__(3,-1),
            lambda r:r['timestamp'].__setitem__(3,r['timestamp'][2]),
            lambda r:r['timestamp'].__setitem__(13,r['timestamp'][13]-10*86400),
        ]:
            payload=fixture();mutation(payload['chart']['result'][0])
            with self.assertRaises(ValueError):
                updater.extract_prices(payload,'^GSPC',dt.datetime(2024,3,10,tzinfo=dt.timezone.utc))
        with self.assertRaises(ValueError):
            updater.extract_prices(fixture(),'^GSPC',dt.datetime(2025,1,1,tzinfo=dt.timezone.utc))

    def test_failed_fetch_does_not_replace_last_good_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'market.json';path.write_text('{"existing":true}')
            with patch.object(updater,'fetch_chart',side_effect=OSError('network down')):
                with self.assertRaises(OSError):updater.update(path)
            self.assertEqual(json.loads(path.read_text()),{'existing':True})

    def test_atomic_success_and_history_regression(self):
        now=dt.datetime.now(dt.timezone.utc)
        latest=now.date().replace(day=1)-dt.timedelta(days=1)
        months=[]
        month=latest.year*12+latest.month-1
        for i in range(14):
            y,m=divmod(month-13+i,12)
            months.append({'date':f'{y:04d}-{m+1:02d}','asOf':f'{y:04d}-{m+1:02d}-28','close':100+i})
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'data.json'
            with patch.object(updater,'fetch_chart',return_value={}),patch.object(updater,'extract_prices',return_value=months):
                updater.update(path)
                self.assertEqual(set(json.loads(path.read_text())['datasets']),{'sp500','nasdaq100'})
                before=path.read_text()
                with patch.object(updater,'extract_prices',return_value=months[1:]):
                    with self.assertRaises(ValueError):updater.update(path)
                self.assertEqual(path.read_text(),before)


if __name__=='__main__':unittest.main()
