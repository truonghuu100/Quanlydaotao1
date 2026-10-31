/* Weekly Work Report module — isolated first release */
let weeklyWeekOffset=0;
let weeklyReportModel={week:null,report:null,tasks:[],plans:[],hours:[0,0,0,0,0,0,0],issues:"",status:"Bản nháp",files:[],canReview:false,reports:[],users:[]};
let weeklyReportLoading=false;
let weeklyActiveTab="mine";

function weeklyDateKey(d){
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function weeklyGetInfo(offset){
  const now=new Date();
  const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+Number(offset||0)*7);
  const day=d.getDay()||7;
  const monday=new Date(d);monday.setDate(d.getDate()-day+1);
  const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
  const thursday=new Date(monday);thursday.setDate(monday.getDate()+3);
  const yearStart=new Date(thursday.getFullYear(),0,1);
  const week=Math.ceil((((thursday-yearStart)/86400000)+1)/7);
  return {key:thursday.getFullYear()+"-W"+String(week).padStart(2,"0"),start:weeklyDateKey(monday),end:weeklyDateKey(sunday),monday,sunday};
}
function weeklyFmtDate(v){
  if(!v)return "—";
  const d=new Date(String(v).slice(0,10)+"T00:00:00");
  return isNaN(d.getTime())?String(v):d.toLocaleDateString("vi-VN");
}
function weeklyParseJson(v,fallback){
  try{const x=JSON.parse(v||"");return x===null?fallback:x;}catch(e){return fallback;}
}
function weeklyEsc(v){return xhtml(String(v??""));}
function weeklyCanReview(){
  return isAdminUser()||hasPermission("weeklyReports","review");
}
function weeklySourceTasks(info){
  const username=String(currentUser?.username||"");
  const list=[];
  (assignments||[]).filter(a=>hasWorkForUser(a,username)).forEach(a=>{
    const pct=Number(progress(a)||0),deadline=String(a.end||plannedEnd(a)||"").slice(0,10);
    const start=String(a.start||"").slice(0,10);
    if(start&&start>info.end)return;
    if(deadline&&deadline<info.start&&pct>=100)return;
    const currentStep=(a.steps||[]).find(s=>String(stepUser(s,a))===username&&String(s.status||"")!=="Hoàn thành");
    const result=currentStep?String(currentStep.result||""):"";
    const status=pct>=100?"Hoàn thành":(deadline&&deadline<weeklyDateKey(new Date())?"Trễ hạn":"Đang thực hiện");
    list.push({id:"JOB_"+String(a.id),source:"Được giao",sourceId:String(a.id),title:displayName(a),deadline:deadline,status:status,progress:pct,result:result,reason:"",priority:"Trung bình",locked:true});
  });
  (ordinaryTasks||[]).filter(t=>String(t.assignee||"")===username).forEach(t=>{
    const deadline=String(t.deadline||"").slice(0,10),created=String(t.createdAt||"").slice(0,10);
    if(created&&created>info.end)return;
    if(deadline&&deadline<info.start&&String(t.status||"").includes("Hoàn thành"))return;
    const latest=(ordinaryTaskReports||[]).filter(r=>String(r.taskId)===String(t.id)).slice(-1)[0];
    const done=String(t.status||"").includes("Hoàn thành");
    const status=done?"Hoàn thành":(deadline&&deadline<weeklyDateKey(new Date())?"Trễ hạn":"Đang thực hiện");
    list.push({id:"TASK_"+String(t.id),source:"Được giao",sourceId:String(t.id),title:t.content,deadline:deadline,status:status,progress:done?100:0,result:latest?String(latest.content||""):"",reason:"",priority:"Trung bình",locked:true});
  });
  return list;
}
function weeklyMergeSourceTasks(saved,info){
  const tasks=Array.isArray(saved)?saved:[];
  const known=new Set(tasks.filter(t=>t.sourceId).map(t=>String(t.source)+":"+String(t.sourceId)));
  weeklySourceTasks(info).forEach(t=>{
    const key=String(t.source)+":"+String(t.sourceId);
    if(!known.has(key)){tasks.push(t);known.add(key);}
  });
  return tasks;
}
function weeklyParseReport(r,info){
  const tasks=weeklyParseJson(r.TASKS_JSON,[]);
  const plans=weeklyParseJson(r.PLANS_JSON,[]);
  const hours=weeklyParseJson(r.HOURS_JSON,{});
  return {
    tasks:weeklyMergeSourceTasks(tasks,info),
    plans:Array.isArray(plans)?plans:[],
    hours:Array.isArray(hours)?hours:[0,0,0,0,0,0,0],
    issues:String(r.VUNG_MAC||""),
    status:String(r.TRANG_THAI||"Bản nháp"),
    files:weeklyParseJson(r.HOSO_DINH_KEM_JSON,[]),
    report:r
  };
}
async function weeklyLoadData(){
  const info=weeklyGetInfo(weeklyWeekOffset);
  weeklyReportLoading=true;
  const root=document.getElementById("weeklyReportRoot");
  if(root)root.innerHTML='<div class="card" style="padding:28px;text-align:center;color:var(--muted)">Đang tải báo cáo tuần…</div>';
  const previousInfo=weeklyGetInfo(weeklyWeekOffset-1);
  const response=await gsCall("getWeeklyReportData",{weekKey:info.key,previousWeekKey:previousInfo.key});
  if(!response||!response.ok)throw new Error(response?.error||"Không tải được báo cáo tuần.");
  weeklyReportModel.week=info;
  weeklyReportModel.report=response.report||null;
  weeklyReportModel.canReview=!!response.canReview;
  weeklyReportModel.reports=Array.isArray(response.reports)?response.reports:[];
  weeklyReportModel.users=Array.isArray(response.users)?response.users:[];
  if(response.report){
    const parsed=weeklyParseReport(response.report,info);
    weeklyReportModel.tasks=parsed.tasks;
    weeklyReportModel.plans=parsed.plans;
    weeklyReportModel.hours=Array.isArray(parsed.hours)&&parsed.hours.length===7?parsed.hours:[0,0,0,0,0,0,0];
    weeklyReportModel.issues=parsed.issues;
    weeklyReportModel.status=parsed.status;
    weeklyReportModel.files=Array.isArray(parsed.files)?parsed.files:[];
  }else{
    weeklyReportModel.tasks=weeklySourceTasks(info);
    const previousTasks=weeklyParseJson(response.previousReport?.TASKS_JSON,[]);
    const existingSources=new Set(weeklyReportModel.tasks.filter(t=>t.sourceId).map(t=>String(t.source)+":"+String(t.sourceId)));
    previousTasks.filter(t=>t.status!=="Hoàn thành").forEach(t=>{
      if(t.sourceId&&existingSources.has(String(t.source)+":"+String(t.sourceId)))return;
      weeklyReportModel.tasks.push({...t,id:"CARRY_"+String(t.id||Date.now())+"_"+Math.random().toString(36).slice(2,6),source:"Chuyển tiếp",locked:false,carriedOverFrom:previousInfo.key});
    });
    weeklyReportModel.plans=[];
    weeklyReportModel.hours=[0,0,0,0,0,0,0];
    weeklyReportModel.issues="";
    weeklyReportModel.files=[];
    weeklyReportModel.status="Bản nháp";
  }
  weeklyReportLoading=false;
  weeklyRenderPage();
}
function weeklyStatusClass(status){
  if(status==="Hoàn thành"||status==="Đã xác nhận")return "done";
  if(status==="Trễ hạn"||status==="Yêu cầu bổ sung")return "late";
  if(status==="Đã gửi"||status==="Đã tiếp nhận")return "review";
  return "";
}
function weeklyStatusOptions(selected){
  return ["Chưa thực hiện","Đang thực hiện","Hoàn thành","Trễ hạn","Tạm dừng"].map(s=>'<option value="'+weeklyEsc(s)+'" '+(selected===s?"selected":"")+'>'+weeklyEsc(s)+"</option>").join("");
}
function weeklyRenderTask(t,i,canEdit){
  const id=weeklyEsc(t.id),status=String(t.status||"Đang thực hiện");
  const pct=Math.max(0,Math.min(100,Number(t.progress)||0));
  const statusControl=canEdit?'<select onchange="weeklyUpdateTask(&quot;'+id+'&quot;,&quot;status&quot;,this.value)">'+weeklyStatusOptions(status)+'</select>':'<span class="weekly-status '+weeklyStatusClass(status)+'">'+weeklyEsc(status)+'</span>';
  const progressControl=canEdit?'<input class="weekly-progress" type="range" min="0" max="100" step="5" value="'+pct+'" oninput="weeklyUpdateTask(&quot;'+id+'&quot;,&quot;progress&quot;,this.value)"/>':'<div style="height:7px;background:#e8edf5;border-radius:9px;overflow:hidden"><i style="display:block;height:100%;width:'+pct+'%;background:#4168e9"></i></div>';
  const result='<div><label class="weekly-task-label">Kết quả thực hiện</label><textarea '+(canEdit?'oninput="weeklyUpdateTask(&quot;'+id+'&quot;,&quot;result&quot;,this.value)"':'disabled')+' placeholder="Mô tả kết quả đã thực hiện…">'+weeklyEsc(t.result||"")+'</textarea></div>';
  const reason=status==="Trễ hạn"?'<div><label class="weekly-task-label">Nguyên nhân trễ hạn *</label><textarea '+(canEdit?'oninput="weeklyUpdateTask(&quot;'+id+'&quot;,&quot;reason&quot;,this.value)"':'disabled')+' placeholder="Nêu rõ nguyên nhân và hướng xử lý…">'+weeklyEsc(t.reason||"")+'</textarea></div>':"";
  const remove=t.source==="Phát sinh"&&canEdit?'<button type="button" class="btn light" onclick="weeklyRemoveTask(&quot;'+id+'&quot;)">Xóa</button>':"";
  return '<article class="weekly-task"><div class="weekly-task-top"><div style="min-width:0;flex:1"><div class="weekly-task-title">'+(i+1)+'. '+weeklyEsc(t.title||"Chưa có tên công việc")+'</div><div class="weekly-task-meta">'+weeklyEsc(t.source||"Phát sinh")+' · Hạn: '+weeklyFmtDate(t.deadline)+'</div></div><span class="weekly-status '+weeklyStatusClass(status)+'">'+weeklyEsc(status)+'</span></div><div class="weekly-task-controls">'+statusControl+'<div>'+progressControl+'</div><b id="weekly-pct-'+id+'" style="font-size:11px;color:#245cf2;text-align:right">'+pct+'%</b></div><div class="weekly-task-grid">'+result+reason+'</div><div class="weekly-task-actions"><span class="weekly-muted">'+(t.locked?"Liên kết công việc gốc":"Công việc phát sinh")+'</span>'+remove+'</div></article>';
}
function weeklyRenderHours(canEdit){
  const days=["T2","T3","T4","T5","T6","T7","CN"];
  return '<div class="weekly-hours-grid">'+days.map((d,i)=>{
    const value=Math.max(0,Math.min(24,Number(weeklyReportModel.hours[i])||0));
    const height=Math.min(100,value/8*100);
    return '<div class="weekly-hour-day"><label>'+d+'</label><div class="weekly-hour-bar"><i style="height:'+height+'%"></i></div><input type="number" min="0" max="24" step="0.5" value="'+value+'" '+(canEdit?'onchange="weeklyUpdateHours('+i+',this.value)"':'disabled')+'/></div>';
  }).join("")+'</div>';
}
function weeklyRenderPlans(canEdit){
  const rows=weeklyReportModel.plans.map((p,i)=>'<div class="weekly-plan-row"><input value="'+weeklyEsc(p.title||"")+'" placeholder="Nội dung công việc" '+(canEdit?'oninput="weeklyUpdatePlan('+i+ ',&quot;title&quot;,this.value)"':'disabled')+'/><input type="date" value="'+weeklyEsc(p.deadline||"")+'" '+(canEdit?'onchange="weeklyUpdatePlan('+i+ ',&quot;deadline&quot;,this.value)"':'disabled')+'/><select '+(canEdit?'onchange="weeklyUpdatePlan('+i+ ',&quot;priority&quot;,this.value)"':'disabled')+'><option '+(p.priority==="Cao"?"selected":"")+'>Cao</option><option '+(p.priority==="Trung bình"||!p.priority?"selected":"")+'>Trung bình</option><option '+(p.priority==="Thấp"?"selected":"")+'>Thấp</option></select><button type="button" '+(canEdit?'onclick="weeklyRemovePlan('+i+')"':'disabled')+'>×</button></div>').join("");
  const add=canEdit?'<div class="weekly-add-plan"><input id="weeklyPlanTitle" class="weekly-inline-input" placeholder="Thêm kế hoạch tuần tới"/><input id="weeklyPlanDate" class="weekly-inline-input" type="date"/><select id="weeklyPlanPriority" class="weekly-inline-input"><option>Trung bình</option><option>Cao</option><option>Thấp</option></select><button class="btn primary" onclick="weeklyAddPlan()">Thêm</button></div>':"";
  return rows+add;
}
function weeklyRenderReview(){
  const host=document.getElementById("weeklyReviewRoot");
  if(!host)return;
  const reports=weeklyReportModel.reports||[];
  const received=new Set(reports.map(r=>String(r.USERNAME||"").toLowerCase()));
  const missing=(weeklyReportModel.users||[]).filter(u=>String(u.TRANG_THAI||"Hoạt động")==="Hoạt động"&&String(u.VAI_TRO||"").toUpperCase()!=="ADMIN"&&!received.has(String(u.USERNAME||"").toLowerCase()));
  if(!reports.length&&!missing.length){host.innerHTML='<div class="weekly-empty">Chưa có dữ liệu báo cáo trong phạm vi quản lý.</div>';return;}
  const reportRows=reports.map(r=>{
    const tasks=weeklyParseJson(r.TASKS_JSON,[]);
    const done=tasks.filter(t=>t.status==="Hoàn thành").length;
    const late=tasks.filter(t=>t.status==="Trễ hạn").length;
    const status=String(r.TRANG_THAI||"Bản nháp"),id=weeklyEsc(r.REPORT_ID||"");
    let actions="";
    if(status==="Đã xác nhận"&&isAdminUser())actions='<button class="btn light" onclick="weeklyReviewAction(&quot;'+id+'&quot;,&quot;reopen&quot;)">Mở lại</button>';
    else if(status==="Đã gửi")actions='<button class="btn light" onclick="weeklyReviewAction(&quot;'+id+'&quot;,&quot;receive&quot;)">Tiếp nhận</button><button class="btn danger" onclick="weeklyReviewAction(&quot;'+id+'&quot;,&quot;changes&quot;)">Yêu cầu bổ sung</button>';
    else if(status==="Đã tiếp nhận")actions='<button class="btn primary" onclick="weeklyReviewAction(&quot;'+id+'&quot;,&quot;confirm&quot;)">Xác nhận</button><button class="btn danger" onclick="weeklyReviewAction(&quot;'+id+'&quot;,&quot;changes&quot;)">Yêu cầu bổ sung</button>';
    else if(status==="Yêu cầu bổ sung")actions='<button class="btn light" onclick="weeklyReviewAction(&quot;'+id+'&quot;,&quot;receive&quot;)">Tiếp nhận lại</button>';
    const details=tasks.map(t=>'<div style="padding:7px 0;border-top:1px solid #edf1f6"><b style="font-size:11px">'+weeklyEsc(t.title||"")+'</b><div class="weekly-muted">'+weeklyEsc(t.status||"")+' · '+(Number(t.progress)||0)+'%</div><div style="font-size:10px;color:#64748b">'+weeklyEsc(t.result||t.reason||"Chưa có ghi chú")+'</div></div>').join("");
    return '<div class="weekly-review-row"><div class="weekly-task-top"><div><b style="font-size:12px;color:#17365d">'+weeklyEsc(r.HO_TEN||r.USERNAME||"")+'</b><div class="weekly-task-meta">'+weeklyEsc(r.DON_VI_ID||"")+' · '+weeklyEsc(r.USERNAME||"")+'</div></div><span class="weekly-status '+weeklyStatusClass(status)+'">'+weeklyEsc(status)+'</span></div><div class="weekly-muted">'+tasks.length+' đầu việc · '+done+' hoàn thành · '+late+' trễ hạn</div><details><summary style="font-size:10px;color:#245cf2;cursor:pointer;margin:7px 0">Xem chi tiết công việc</summary>'+details+'</details><input class="weekly-review-comment" id="weeklyReviewComment_'+id+'" placeholder="Nhận xét / nội dung yêu cầu bổ sung…"/><div class="weekly-review-actions">'+actions+'</div></div>';
  }).join("");
  const missingRows=missing.map(u=>'<div class="weekly-review-row"><div class="weekly-task-top"><div><b style="font-size:12px;color:#17365d">'+weeklyEsc(u.HO_TEN||u.USERNAME||"")+'</b><div class="weekly-task-meta">'+weeklyEsc(u.DON_VI_ID||"")+' · '+weeklyEsc(u.USERNAME||"")+'</div></div><span class="weekly-status late">Chưa gửi</span></div></div>').join("");
  host.innerHTML='<div style="padding:12px 15px;background:#f7f9fd;border-bottom:1px solid #e8edf5;font-size:11px;color:#64748b">Đã gửi: <b>'+reports.length+'</b> · Chưa gửi: <b>'+missing.length+'</b> · Tổng nhân sự trong phạm vi: <b>'+(reports.length+missing.length)+'</b></div>'+reportRows+(missingRows?'<div style="padding:12px 15px 5px;font-size:11px;font-weight:800;color:#647695">NHÂN SỰ CHƯA GỬI BÁO CÁO</div>'+missingRows:"");
}
function weeklyRenderSummary(){
 const host=document.getElementById("weeklySummaryRoot");if(!host)return;
 const reports=weeklyReportModel.reports||[],users=weeklyReportModel.users||[];
 const byUser=new Map(reports.map(r=>[String(r.USERNAME||"").toLowerCase(),r]));
 const people=users.filter(u=>String(u.TRANG_THAI||"Hoạt động")==="Hoạt động"&&String(u.VAI_TRO||"").toUpperCase()!=="ADMIN").map(u=>({user:u,report:byUser.get(String(u.USERNAME||"").toLowerCase())||null}));
 reports.forEach(r=>{if(!people.some(x=>String(x.user.USERNAME||"").toLowerCase()===String(r.USERNAME||"").toLowerCase()))people.push({user:r,report:r});});
 const search=(document.getElementById("weeklySummarySearch")?.value||"").toLowerCase(),filter=document.getElementById("weeklySummaryStatus")?.value||"";
 const filtered=people.filter(x=>{const u=x.user,r=x.report,status=String(r?.TRANG_THAI||"Chưa gửi");return (!search||[u.HO_TEN,u.USERNAME,u.DON_VI_ID].join(" ").toLowerCase().includes(search))&&(!filter||status===filter);});
 const submitted=people.filter(x=>x.report).length,missing=people.length-submitted;
 const allTasks=reports.flatMap(r=>weeklyParseJson(r.TASKS_JSON,[]));
 const rows=filtered.map((x,i)=>{
  const r=x.report||{},u=x.user||{},tasks=x.report?weeklyParseJson(r.TASKS_JSON,[]):[],plans=x.report?weeklyParseJson(r.PLANS_JSON,[]):[];
  const done=tasks.filter(t=>t.status==="Hoàn thành").length,active=tasks.filter(t=>t.status==="Đang thực hiện"||t.status==="Chưa thực hiện").length,late=tasks.filter(t=>t.status==="Trễ hạn").length,status=String(r.TRANG_THAI||"Chưa gửi");
  const details=x.report?'<details><summary>Xem nội dung</summary><div class="weekly-summary-detail-body"><b>Kết quả công việc</b>'+(tasks.length?tasks.map(t=>'<div class="weekly-summary-item"><b>'+weeklyEsc(t.title||"")+'</b><span>'+weeklyEsc(t.source||"")+' · '+weeklyEsc(t.status||"")+' · '+(Number(t.progress)||0)+'%</span><p>'+weeklyEsc(t.result||"Chưa cập nhật kết quả")+(t.reason?' · '+weeklyEsc(t.reason):"")+'</p></div>').join(""):"<p>Không có đầu việc.</p>")+'<b>Kế hoạch tuần tới</b>'+(plans.length?plans.map(p=>'<div class="weekly-summary-item">'+weeklyEsc(p.title||"")+' · '+weeklyFmtDate(p.deadline)+'</div>').join(""):"<p>Chưa có kế hoạch.</p>")+'<b>Vướng mắc / đề xuất</b><p>'+weeklyEsc(r.VUNG_MAC||"Không có")+'</p></div></details>':'<span class="weekly-muted">Chưa gửi báo cáo</span>';
  return '<tr><td>'+(i+1)+'</td><td><b>'+weeklyEsc(u.HO_TEN||u.USERNAME||"")+'</b><div class="weekly-muted">'+weeklyEsc(u.USERNAME||"")+'</div></td><td>'+weeklyEsc(u.DON_VI_ID||"")+'</td><td><span class="weekly-status '+weeklyStatusClass(status)+'">'+weeklyEsc(status)+'</span></td><td>'+tasks.length+'</td><td>'+done+'</td><td>'+active+'</td><td>'+late+'</td><td>'+details+'</td></tr>';
 }).join("");
 host.innerHTML='<div class="weekly-summary-kpis"><div><small>Nhân sự</small><b>'+people.length+'</b></div><div><small>Đã gửi</small><b>'+submitted+'</b></div><div><small>Chưa gửi</small><b>'+missing+'</b></div><div><small>Tổng đầu việc</small><b>'+allTasks.length+'</b></div><div><small>Hoàn thành / Trễ hạn</small><b>'+allTasks.filter(t=>t.status==="Hoàn thành").length+' / '+allTasks.filter(t=>t.status==="Trễ hạn").length+'</b></div></div><div class="weekly-summary-tools"><input id="weeklySummarySearch" value="'+weeklyEsc(search)+'" placeholder="Tìm họ tên, mã nhân viên, đơn vị…" oninput="weeklyRenderSummary()"><select id="weeklySummaryStatus" onchange="weeklyRenderSummary()"><option value="">Tất cả trạng thái</option>'+["Đã gửi","Đã tiếp nhận","Đã xác nhận","Yêu cầu bổ sung","Chưa gửi"].map(s=>'<option '+(filter===s?"selected":"")+'>'+s+'</option>').join("")+'</select><button class="btn light" onclick="weeklyExportSummaryCsv()">Xuất Excel</button></div><div class="weekly-summary-table-wrap"><table class="weekly-summary-table"><thead><tr><th>STT</th><th>Nhân sự</th><th>Đơn vị</th><th>Trạng thái</th><th>Tổng việc</th><th>Hoàn thành</th><th>Đang làm</th><th>Trễ hạn</th><th>Nội dung tổng hợp</th></tr></thead><tbody>'+rows+'</tbody></table>'+(filtered.length?"":'<div class="weekly-empty">Không có dữ liệu.</div>')+'</div>';
}
function weeklyExportSummaryCsv(){
 const rows=[["Mã NV","Họ tên","Đơn vị","Trạng thái","Tổng việc","Hoàn thành","Đang làm","Trễ hạn","Kết quả","Kế hoạch tuần tới","Vướng mắc"]];
 const reports=weeklyReportModel.reports||[],users=weeklyReportModel.users||[],map=new Map(reports.map(r=>[String(r.USERNAME||"").toLowerCase(),r]));
 users.filter(u=>String(u.TRANG_THAI||"Hoạt động")==="Hoạt động"&&String(u.VAI_TRO||"").toUpperCase()!=="ADMIN").forEach(u=>{const r=map.get(String(u.USERNAME||"").toLowerCase()),t=r?weeklyParseJson(r.TASKS_JSON,[]):[],p=r?weeklyParseJson(r.PLANS_JSON,[]):[];rows.push([u.USERNAME||"",u.HO_TEN||"",u.DON_VI_ID||"",r?.TRANG_THAI||"Chưa gửi",t.length,t.filter(x=>x.status==="Hoàn thành").length,t.filter(x=>x.status==="Đang thực hiện"||x.status==="Chưa thực hiện").length,t.filter(x=>x.status==="Trễ hạn").length,t.map(x=>(x.title||"")+" — "+(x.result||"")).join(" | "),p.map(x=>x.title||"").join(" | "),r?.VUNG_MAC||""]);});
 const csv="\uFEFF"+rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n"),blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Tong_hop_bao_cao_"+(weeklyReportModel.week?.key||"")+".csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

function weeklyRenderPage(){
  const root=document.getElementById("weeklyReportRoot"),info=weeklyReportModel.week;
  if(!root||!info)return;
  const canEdit=["Bản nháp","Yêu cầu bổ sung"].includes(weeklyReportModel.status);
  const tasks=weeklyReportModel.tasks||[];
  const done=tasks.filter(t=>t.status==="Hoàn thành").length,late=tasks.filter(t=>t.status==="Trễ hạn").length,active=tasks.filter(t=>t.status==="Đang thực hiện"||t.status==="Chưa thực hiện").length;
  const due=tasks.filter(t=>!t.deadline||t.deadline<=info.end).length;
  const onTime=due?Math.round(done/due*100):0;
  const canReview=weeklyCanReview()&&weeklyReportModel.canReview;
  document.getElementById("weeklyWeekLabel").textContent="Tuần "+info.key.replace(/^\\d{4}-W/,"")+" · "+weeklyFmtDate(info.start)+" – "+weeklyFmtDate(info.end);
  const tabs=canReview?'<div class="weekly-tabs"><button class="btn '+(weeklyActiveTab==="mine"?"primary":"light")+'" onclick="weeklySetTab(&quot;mine&quot;)">Báo cáo của tôi</button><button class="btn '+(weeklyActiveTab==="review"?"primary":"light")+'" onclick="weeklySetTab(&quot;review&quot;)">Tiếp nhận báo cáo</button></div>':"";
  if(weeklyActiveTab==="review"&&canReview){
    root.innerHTML=tabs+'<div class="weekly-card"><div class="weekly-cardhead"><b>Danh sách báo cáo cần tiếp nhận</b><div style="display:flex;align-items:center;gap:8px"><span class="weekly-muted">'+(weeklyReportModel.reports||[]).length+' báo cáo</span><button class="btn light" onclick="weeklyExportReviewCsv()">Xuất Excel</button></div></div><div id="weeklyReviewRoot"></div></div>';
    weeklyRenderReview();return;
  }
  const taskCards=tasks.length?tasks.map((t,i)=>weeklyRenderTask(t,i,canEdit)).join(""):'<div class="weekly-empty">Chưa có công việc trong tuần. Có thể thêm công việc phát sinh bên dưới.</div>';
  const addTask=canEdit?'<div class="weekly-add-task"><input id="weeklyNewTaskTitle" class="weekly-inline-input" placeholder="Nhập công việc phát sinh"/><input id="weeklyNewTaskDate" class="weekly-inline-input" type="date"/><select id="weeklyNewTaskPriority" class="weekly-inline-input"><option>Trung bình</option><option>Cao</option><option>Thấp</option></select><button class="btn primary" onclick="weeklyAddTask()">Thêm</button></div>':"";
  const taskContent='<div class="weekly-card"><div class="weekly-cardhead"><b>01. Kết quả công việc trong tuần</b><span class="weekly-muted">'+tasks.length+' đầu việc</span></div>'+addTask+taskCards+'</div>';
  const plansContent='<div class="weekly-card"><div class="weekly-cardhead"><b>02. Kế hoạch tuần tiếp theo</b><span class="weekly-muted">'+weeklyReportModel.plans.length+' đầu việc</span></div><div class="weekly-cardbody">'+weeklyRenderPlans(canEdit)+'</div></div>';
  const attachments=weeklyReportModel.files||[];
  const attachmentRows=attachments.length?attachments.map(f=>'<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #edf1f6"><a href="'+weeklyEsc(f.url||("#"))+'" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#245cf2;text-decoration:none;overflow-wrap:anywhere">📎 '+weeklyEsc(f.name||f.title||"Tệp đính kèm")+'</a><span class="weekly-muted">'+Math.max(1,Math.round(Number(f.size||0)/1024))+' KB</span></div>').join(""):'<div class="weekly-muted">Chưa có file minh chứng.</div>';
  const attachmentContent='<div class="weekly-card"><div class="weekly-cardhead"><b>04. File liên quan</b><span class="weekly-muted">Tùy chọn · Tối đa 100 MB/file</span></div><div class="weekly-cardbody">'+attachmentRows+(canEdit?'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px"><input id="weeklyReportFiles" type="file" multiple style="font-size:11px;max-width:100%"/><button class="btn light" onclick="weeklyUploadSelectedFiles()">Tải file lên</button></div>':"")+'</div></div>';
  const issuesContent='<div class="weekly-card weekly-issues"><div class="weekly-cardhead"><b>03. Vướng mắc và đề xuất</b><span class="weekly-muted">Không bắt buộc</span></div><div class="weekly-cardbody"><textarea id="weeklyIssues" '+(canEdit?'oninput="weeklyReportModel.issues=this.value"':'disabled')+' placeholder="Ghi rõ khó khăn, nguyên nhân, nội dung cần hỗ trợ hoặc đề xuất…">'+weeklyEsc(weeklyReportModel.issues)+'</textarea></div></div>';
  const reviewComment=weeklyReportModel.report?.REVIEW_COMMENT?'<div class="weekly-card"><div class="weekly-cardbody"><b style="color:#a36a00">Ý kiến quản lý</b><p style="font-size:11px;color:#64748b;margin:7px 0 0">'+weeklyEsc(weeklyReportModel.report.REVIEW_COMMENT)+'</p></div></div>':"";
  const footer='<div class="weekly-report-footer"><div><span class="weekly-status '+weeklyStatusClass(weeklyReportModel.status)+'">'+weeklyEsc(weeklyReportModel.status)+'</span><div class="weekly-muted" style="margin-top:6px">Lưu gần nhất: '+(weeklyReportModel.report?.UPDATED_AT?new Date(weeklyReportModel.report.UPDATED_AT).toLocaleString("vi-VN"):"Chưa lưu")+'</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">'+(canEdit?'<button class="btn light" onclick="weeklySave(false)">Lưu nháp</button><button class="btn primary" onclick="weeklySave(true)">Gửi báo cáo</button>':'<span class="weekly-muted">Báo cáo đã gửi và đang chờ xử lý.</span>')+'</div></div>';
  root.innerHTML=tabs+'<div class="weekly-shell"><div class="weekly-kpis"><div class="weekly-kpi"><small>Tổng đầu việc</small><strong>'+tasks.length+'</strong><span>Công việc trong kỳ báo cáo</span></div><div class="weekly-kpi"><small>Hoàn thành</small><strong style="color:#07865b">'+done+'</strong><span>Đầu việc đã hoàn thành</span></div><div class="weekly-kpi"><small>Đang thực hiện</small><strong style="color:#245cf2">'+active+'</strong><span>Đầu việc đang xử lý</span></div><div class="weekly-kpi"><small>Trễ hạn</small><strong style="color:#c33d3d">'+late+'</strong><span>Cần nêu nguyên nhân</span></div></div><div class="weekly-columns"><div class="weekly-shell">'+taskContent+'</div><div class="weekly-side-stack">'+plansContent+issuesContent+attachmentContent+reviewComment+'<div class="weekly-card"><div class="weekly-cardbody">'+footer+'</div></div></div></div></div>';
}
async function renderWeeklyReport(){
  if(weeklyReportLoading)return;
  try{await weeklyLoadData();}catch(e){const root=document.getElementById("weeklyReportRoot");if(root)root.innerHTML='<div class="weekly-card"><div class="weekly-cardbody" style="color:#b42318">Không tải được báo cáo: '+weeklyEsc(e.message||e)+'<div style="margin-top:12px"><button class="btn primary" onclick="renderWeeklyReport()">Thử lại</button></div></div></div>';}
}
function weeklyChangeWeek(delta){
  weeklyWeekOffset=Math.max(-52,Math.min(52,weeklyWeekOffset+Number(delta||0)));
  weeklyActiveTab="mine";renderWeeklyReport();
}
function weeklySetTab(tab){
  weeklyActiveTab=tab;
  if(tab==="review")weeklyLoadData().catch(e=>toast("Không tải được danh sách báo cáo: "+(e.message||e)));
  else weeklyRenderPage();
}
function weeklyUpdateTask(id,field,value){
  const t=weeklyReportModel.tasks.find(x=>String(x.id)===String(id));if(!t)return;
  t[field]=field==="progress"?Number(value):value;
  if(field==="status"&&value==="Hoàn thành")t.progress=100;
  if(field==="status"&&value!=="Hoàn thành"&&Number(t.progress)===100)t.progress=90;
  if(field==="status"){weeklyRenderPage();return;}
  const pct=document.getElementById("weekly-pct-"+id);if(pct)pct.textContent=(Number(t.progress)||0)+"%";
}
function weeklyRemoveTask(id){
  weeklyReportModel.tasks=weeklyReportModel.tasks.filter(t=>String(t.id)!==String(id));weeklyRenderPage();
}
function weeklyAddTask(){
  const title=document.getElementById("weeklyNewTaskTitle")?.value.trim()||"";
  const deadline=document.getElementById("weeklyNewTaskDate")?.value||"";
  const priority=document.getElementById("weeklyNewTaskPriority")?.value||"Trung bình";
  if(!title){toast("Vui lòng nhập nội dung công việc phát sinh.");return;}
  weeklyReportModel.tasks.push({id:"MANUAL_"+Date.now(),source:"Phát sinh",sourceId:"",title,deadline,status:"Đang thực hiện",progress:0,result:"",reason:"",priority,locked:false});
  weeklyRenderPage();
}
function weeklyUpdateHours(index,value){
  weeklyReportModel.hours[index]=Math.max(0,Math.min(24,Number(value)||0));
  const label=document.getElementById("weeklyHoursTotal");
  if(label)label.textContent="Tổng: "+weeklyReportModel.hours.reduce((a,b)=>a+(Number(b)||0),0)+" giờ";
}
function weeklyUpdatePlan(index,field,value){
  if(weeklyReportModel.plans[index])weeklyReportModel.plans[index][field]=value;
}
function weeklyAddPlan(){
  const title=document.getElementById("weeklyPlanTitle")?.value.trim()||"";
  const deadline=document.getElementById("weeklyPlanDate")?.value||"";
  const priority=document.getElementById("weeklyPlanPriority")?.value||"Trung bình";
  if(!title){toast("Vui lòng nhập nội dung kế hoạch.");return;}
  weeklyReportModel.plans.push({title,deadline,priority});weeklyRenderPage();
}
function weeklyRemovePlan(index){
  weeklyReportModel.plans.splice(index,1);weeklyRenderPage();
}
function weeklyPayload(){
  const info=weeklyReportModel.week;
  return {weekKey:info.key,weekStart:info.start,weekEnd:info.end,tasks:weeklyReportModel.tasks,plans:weeklyReportModel.plans,hours:weeklyReportModel.hours,issues:weeklyReportModel.issues};
}
async function weeklySave(submit){
  const tasks=weeklyReportModel.tasks||[];
  if(submit&&!tasks.length){toast("Báo cáo cần có ít nhất một đầu việc.");return;}
  for(const t of tasks){
    if(t.status==="Hoàn thành"&&!String(t.result||"").trim()){toast("Vui lòng nhập kết quả cho công việc hoàn thành: "+t.title);return;}
    if(t.status==="Trễ hạn"&&!String(t.reason||"").trim()){toast("Vui lòng nêu nguyên nhân trễ hạn: "+t.title);return;}
  }
  try{
    const r=await gsCall(submit?"submitWeeklyReport":"saveWeeklyReportDraft",weeklyPayload());
    if(!r||!r.ok)throw new Error(r?.error||"Không lưu được báo cáo.");
    weeklyReportModel.report=r.report;weeklyReportModel.status=String(r.report.TRANG_THAI||"Bản nháp");
    toast(submit?"Đã gửi báo cáo công việc tuần.":"Đã lưu bản nháp báo cáo.");
    if(submit)weeklyActiveTab="mine";
    weeklyRenderPage();
  }catch(e){toast("Lỗi lưu báo cáo: "+(e.message||e));}
}

async function weeklyUploadSelectedFiles(){
  const input=document.getElementById("weeklyReportFiles"),files=Array.from(input?.files||[]);
  if(!files.length){toast("Chọn ít nhất một file minh chứng.");return;}
  for(const f of files)if(!f.size||f.size>100*1024*1024){toast("File "+f.name+" rỗng hoặc vượt giới hạn 100 MB.");return;}
  try{
    if(!weeklyReportModel.report?.REPORT_ID){
      const saved=await gsCall("saveWeeklyReportDraft",weeklyPayload());
      if(!saved||!saved.ok)throw new Error(saved?.error||"Không lưu được bản nháp trước khi tải file.");
      weeklyReportModel.report=saved.report;
    }
    const reportId=weeklyReportModel.report.REPORT_ID;
    showUploadOverlay();let done=0;
    for(const file of files){
      const session=await gsCall("createWeeklyReportUploadSession",{reportId,fileName:file.name,mimeType:file.type||"application/octet-stream",size:file.size});
      if(!session||!session.ok||!session.uploadKey)throw new Error(session?.error||"Không tạo được phiên tải file "+file.name);
      let start=0,driveFileId="";
      while(start<file.size){
        const end=Math.min(start+4*1024*1024,file.size),blob=file.slice(start,end);
        const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.onerror=()=>reject(new Error("Không đọc được file "+file.name));reader.readAsDataURL(blob);});
        const part=await gsCall("uploadWeeklyReportFileChunk",{reportId,uploadKey:session.uploadKey,start,total:file.size,base64});
        if(!part||!part.ok)throw new Error(part?.error||"Tải file không thành công: "+file.name);
        start=end;
        if(part.done){driveFileId=part.driveFileId||"";break;}
        updateUploadOverlay(((done+start/file.size)/files.length)*100,"Đang tải: "+file.name,done,files.length);
      }
      if(!driveFileId)throw new Error("Chưa nhận được xác nhận hoàn tất file "+file.name);
      const fin=await gsCall("finalizeWeeklyReportUpload",{reportId,uploadKey:session.uploadKey,driveFileId});
      if(!fin||!fin.ok||!fin.file)throw new Error(fin?.error||"Chưa xác nhận được file "+file.name);
      done++;updateUploadOverlay(done/files.length*100,"Đã tải: "+file.name,done,files.length);
    }
    finishUploadOverlay("success","ĐÃ TẢI FILE MINH CHỨNG","File đã được lưu vào báo cáo tuần.",files.length,files.length,{reportId});
    await weeklyLoadData();
  }catch(e){finishUploadOverlay("failure","CHƯA TẢI ĐƯỢC FILE",e.message||String(e),0,files.length,null);toast("Lỗi tải file: "+(e.message||e));}
}


function weeklyExportReviewCsv(){
  const rows=[["Tuần báo cáo","Mã nhân viên","Họ tên","Đơn vị","Trạng thái","Tổng đầu việc","Hoàn thành","Trễ hạn","Vướng mắc"]];
  (weeklyReportModel.reports||[]).forEach(r=>{
    const tasks=weeklyParseJson(r.TASKS_JSON,[]);
    rows.push([r.WEEK_KEY||"",r.USERNAME||"",r.HO_TEN||"",r.DON_VI_ID||"",r.TRANG_THAI||"",tasks.length,tasks.filter(t=>t.status==="Hoàn thành").length,tasks.filter(t=>t.status==="Trễ hạn").length,r.VUNG_MAC||""]);
  });
  (weeklyReportModel.users||[]).filter(u=>!(weeklyReportModel.reports||[]).some(r=>String(r.USERNAME||"")===String(u.USERNAME||""))).forEach(u=>rows.push([weeklyReportModel.week?.key||"",u.USERNAME||"",u.HO_TEN||"",u.DON_VI_ID||"","Chưa gửi",0,0,0,""]));
  const csv="\\uFEFF"+rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\\r\\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="Bao_cao_cong_viec_tuan_"+(weeklyReportModel.week?.key||"")+".csv";
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

async function weeklyReviewAction(reportId,action){
  const input=document.getElementById("weeklyReviewComment_"+reportId);
  const comment=input?.value.trim()||"";
  if(action==="changes"&&!comment){toast("Vui lòng nhập nội dung cần bổ sung.");return;}
  try{
    const r=await gsCall("reviewWeeklyReport",{reportId,action,comment});
    if(!r||!r.ok)throw new Error(r?.error||"Không cập nhật được trạng thái báo cáo.");
    toast("Đã cập nhật trạng thái báo cáo.");
    await weeklyLoadData();
    weeklyActiveTab="review";weeklyRenderPage();
  }catch(e){toast("Lỗi tiếp nhận báo cáo: "+(e.message||e));}
}
