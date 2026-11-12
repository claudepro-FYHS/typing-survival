"""Creates (once) and updates the Typing Survival backend in claude_pro's Google account.
   python tools/deploy_backend.py "description"
Ids are kept in tools/deploy.json; delete nothing by hand unless you mean to start over."""
import sys, json, os, subprocess
sys.path.insert(0, r'C:\Users\chowz\AppData\Local\hermes\foonyew')
from gauth import api

ACCT = 'claude_pro'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STATE = os.path.join(HERE, 'deploy.json')
TITLE = '打字求生 Typing Survival'
SCRIPT = 'https://script.googleapis.com/v1/projects'
desc = sys.argv[1] if len(sys.argv) > 1 else 'update'

st = json.load(open(STATE, encoding='utf-8')) if os.path.exists(STATE) else {}
def keep():
    json.dump(st, open(STATE, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)

# constants (tab names, headers, default settings) straight from Code.gs
node = ("const vm=require('vm'),fs=require('fs');const c={};vm.createContext(c);"
        "vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);"
        "console.log(JSON.stringify({P:c.SHEET_PLAYERS,S:c.SHEET_SCORES,T:c.SHEET_TEACHERS,B:c.SHEET_BANNED,G:c.SHEET_SETTINGS,"
        "ph:c.PLAYER_HEADERS,sh:c.SCORE_HEADERS,th:c.TEACHER_HEADERS,ds:c.DEFAULT_SETTINGS}))")
C = json.loads(subprocess.run(['node', '-e', node, os.path.join(ROOT, 'apps-script', 'Code.gs')], capture_output=True, text=True, encoding='utf-8', check=True).stdout)

if 'sheetId' not in st:
    found = api(ACCT, 'GET', 'https://www.googleapis.com/drive/v3/files', params={
        'q': "name = '%s' and trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet'" % TITLE, 'fields': 'files(id,name,createdTime)'})
    if found.get('files'):
        sys.exit('A sheet with this name already exists, not creating another: %s' % found['files'])
    tabs = [(C['P'], [C['ph']]), (C['S'], [C['sh']]), (C['G'], C['ds']), (C['T'], [C['th']]), (C['B'], [['Banned nickname words']])]
    body = {'properties': {'title': TITLE, 'timeZone': 'Asia/Kuala_Lumpur', 'locale': 'en_GB'},
            'sheets': [{'properties': {'title': n, 'gridProperties': {'frozenRowCount': 1}}} for n, _ in tabs]}
    ss = api(ACCT, 'POST', 'https://sheets.googleapis.com/v4/spreadsheets', body=body)
    st['sheetId'] = ss['spreadsheetId']; keep()
    api(ACCT, 'POST', 'https://sheets.googleapis.com/v4/spreadsheets/%s/values:batchUpdate' % st['sheetId'], body={
        'valueInputOption': 'RAW', 'data': [{'range': "'%s'!A1" % n, 'values': rows} for n, rows in tabs]})
    api(ACCT, 'POST', 'https://sheets.googleapis.com/v4/spreadsheets/%s:batchUpdate' % st['sheetId'], body={'requests': [
        {'repeatCell': {'range': {'sheetId': s['properties']['sheetId'], 'startRowIndex': 0, 'endRowIndex': 1},
                        'cell': {'userEnteredFormat': {'textFormat': {'bold': True}}}, 'fields': 'userEnteredFormat.textFormat.bold'}} for s in ss['sheets']]})
    print('sheet created', st['sheetId'])

if 'scriptId' not in st:
    p = api(ACCT, 'POST', SCRIPT, body={'title': TITLE + ' backend', 'parentId': st['sheetId']})
    st['scriptId'] = p['scriptId']; keep()
    print('script created', st['scriptId'])

files = [
    {'name': 'appsscript', 'type': 'JSON', 'source': open(os.path.join(ROOT, 'apps-script', 'appsscript.json'), encoding='utf-8').read()},
    {'name': 'Code', 'type': 'SERVER_JS', 'source': open(os.path.join(ROOT, 'apps-script', 'Code.gs'), encoding='utf-8').read()},
]
api(ACCT, 'PUT', '%s/%s/content' % (SCRIPT, st['scriptId']), body={'files': files})
v = api(ACCT, 'POST', '%s/%s/versions' % (SCRIPT, st['scriptId']), body={'description': desc})
cfg = {'versionNumber': v['versionNumber'], 'manifestFileName': 'appsscript', 'description': desc}
if 'deploymentId' not in st:
    d = api(ACCT, 'POST', '%s/%s/deployments' % (SCRIPT, st['scriptId']), body=cfg)
    st['deploymentId'] = d['deploymentId']
else:
    d = api(ACCT, 'PUT', '%s/%s/deployments/%s' % (SCRIPT, st['scriptId'], st['deploymentId']), body={'deploymentConfig': dict(cfg, scriptId=st['scriptId'])})
st['version'] = v['versionNumber']
st['url'] = 'https://script.google.com/macros/s/%s/exec' % st['deploymentId']
keep()
print(json.dumps({'version': st['version'], 'url': st['url'], 'entryPoints': d.get('entryPoints')}, ensure_ascii=False))
