import csv,json,urllib.request,urllib.parse,concurrent.futures as cf,time
rows=list(csv.DictReader(open('data/realpage-starter/data/sample_addresses.csv')))
def call(x):
    st=x['state']; city=x['postal_city']
    q={'street':x['street_address'],'city':city,'state':st,'benchmark':'Public_AR_Current','vintage':'Current_Current','layers':'all','format':'json'}
    if st!='NJ' and x['zip'] and city not in('San Francisco','Cambridge'): q['zip']=x['zip']
    url='https://geocoding.geo.census.gov/geocoder/geographies/address?'+urllib.parse.urlencode(q)
    for a in range(3):
        try:
            d=json.load(urllib.request.urlopen(url,timeout=40))
            m=d['result']['addressMatches']
            if not m: return x['address_id'],None
            g=m[0]['geographies']
            place=(g.get('Incorporated Places') or [{}])[0].get('NAME')
            cnty=(g.get('Counties') or [{}])[0].get('NAME')
            return x['address_id'],{'place':place,'county':cnty,'n':len(m),'lon':m[0]['coordinates']['x'],'lat':m[0]['coordinates']['y']}
        except Exception as e: err=str(e); time.sleep(2)
    return x['address_id'],{'error':err}
with cf.ThreadPoolExecutor(8) as ex: res=dict(ex.map(call,rows))
json.dump(res,open('geo_results.json','w'))
