export const TIMETREE_BOOKMARKLET =
  "javascript:(async()=>{try{" +
  "let NL=String.fromCharCode(10);" +
  "let raw=prompt('請貼上 SICU 班表資料：','')||'';" +
  "if(!raw){alert('沒有取得 SICU 班表資料');return}" +

  "let data;" +
  "try{data=JSON.parse(raw)}catch(e){" +
  "alert('貼上的內容不是 SICU 班表資料。'+NL+NL+'請回到 SICU Web App，重新按一次「複製班表到 TimeTree」。');return}" +

  "if(data.schema!=='sicu-roster-v1'||!Array.isArray(data.events)){" +
  "alert('SICU 班表資料格式不正確');return}" +

  "let meta=document.querySelector('meta[name=\"csrf-token\"]');" +
  "if(!meta||!meta.content){" +
  "alert('找不到 TimeTree CSRF token。'+NL+'請重新整理 TimeTree 網頁後再執行書籤。');return}" +

  "let h={'Accept':'application/json','X-Timetreea':'web/2.1.0/zh-TW'};" +

  "let cr=await fetch('/api/v1/calendars?since=0',{" +
  "credentials:'include',headers:h});" +

  "if(!cr.ok){" +
  "alert('讀取 TimeTree 行事曆失敗 HTTP '+cr.status);return}" +

  "let cj=await cr.json();" +
  "let cals=cj.calendars||cj;" +

  "if(!Array.isArray(cals)){" +
  "alert('TimeTree 行事曆資料格式不正確');return}" +

  "let cal=cals.find(c=>c.name===data.calendarName);" +

  "if(!cal){" +
  "alert('找不到 TimeTree 行事曆「'+data.calendarName+'」');return}" +

  "let lr=await fetch('/api/v1/calendar/'+cal.id+'/labels',{" +
  "credentials:'include',headers:h});" +

  "if(!lr.ok){" +
  "alert('讀取 TimeTree 標籤失敗 HTTP '+lr.status);return}" +

  "let lj=await lr.json();" +
  "let labels=lj.calendar_labels||lj.labels||lj;" +

  "if(!Array.isArray(labels)){" +
  "alert('TimeTree 標籤資料格式不正確');return}" +

  "let labelMap={};" +
  "labels.forEach(l=>{labelMap[l.name]=l.id});" +

  "let missing=[...new Set(" +
  "data.events.map(e=>e.labelName).filter(n=>labelMap[n]===undefined)" +
  ")];" +

  "if(missing.length){" +
  "alert('TimeTree 找不到這些標籤：'+missing.join('、'));return}" +

  "let counts={};" +
  "data.events.forEach(e=>{" +
  "counts[e.title]=(counts[e.title]||0)+1});" +

  "let summary=[" +
  "data.person+'｜'+data.year+' 年 '+data.month+' 月'," +
  "''," +
  "'白班：'+(counts['白班']||0)+' 筆'," +
  "'小夜班：'+(counts['小夜班']||0)+' 筆'," +
  "'大夜班：'+(counts['大夜班']||0)+' 筆'," +
  "''," +
  "'總計：'+data.events.length+' 筆'," +
  "'目標：'+cal.name," +
  "''," +
  "'注意：目前尚未啟用防重複。'," +
  "'同一份班表請勿重複匯入。'," +
  "''," +
  "'確定新增？'" +
  "].join(NL);" +

  "if(!confirm(summary))return;" +

  "let csrf=meta.content;" +
  "let ok=0;" +
  "let fail=[];" +

  "for(let e of data.events){" +
  "let isAllDay=e.allDay===true;" +

  "let body={" +
  "title:e.title," +
  "summary:e.title," +
  "description:e.note," +
  "note:e.note," +
  "all_day:isAllDay," +
  "start_at:e.startAt," +
  "end_at:e.endAt," +
  "start_timezone:'Asia/Taipei'," +
  "end_timezone:'Asia/Taipei'," +
  "timezone:'Asia/Taipei'," +
  "label_id:labelMap[e.labelName]," +
  "attendees:[]," +
  "recurrences:[]," +
  "alerts:[]," +
  "file_uuids:[]" +
  "};" +

  "let r=await fetch('/api/v1/calendar/'+cal.id+'/event',{" +
  "method:'POST'," +
  "credentials:'include'," +
  "headers:{" +
  "'Accept':'application/json'," +
  "'Content-Type':'application/json'," +
  "'X-CSRF-Token':csrf," +
  "'X-Timetreea':'web/2.1.0/zh-TW'" +
  "}," +
  "body:JSON.stringify(body)" +
  "});" +

  "if(r.ok){" +
  "ok++" +
  "}else{" +
  "fail.push(e.date+' '+e.title+' HTTP '+r.status)" +
  "}" +

  "await new Promise(resolve=>setTimeout(resolve,300))" +
  "}" +

  "let result=[" +
  "'匯入完成'," +
  "''," +
  "'成功：'+ok+' 筆'," +
  "'失敗：'+fail.length+' 筆'" +
  "];" +

  "if(fail.length){" +
  "result.push('',...fail.slice(0,8))" +
  "}" +

  "alert(result.join(NL))" +
  "}catch(e){" +
  "alert('SICU 匯入失敗：'+String(e))" +
  "}})();";
