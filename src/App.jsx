import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

// 로컬 날짜를 YYYY-MM-DD로 반환 (UTC 아님)
function localDateStr(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
// 새벽 5시 기준 날짜 (0~4시는 전날로 취급)
function todayStr() {
  const d=new Date();
  if(d.getHours()<5) d.setDate(d.getDate()-1);
  return localDateStr(d);
}
function tomorrowStr() {
  const d=new Date();
  if(d.getHours()<5) d.setDate(d.getDate()-1);
  d.setDate(d.getDate()+1);
  return localDateStr(d);
}
function fmtSecs(s) {
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  if(h>0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
function fmtHours(secs) {
  const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;
  return `${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
}
let _id=Date.now();

const DEF = {
  nickname:"", onboardingDone:false,
  userId:null, // Supabase users.id
  quests:[], scheduledQuests:[],
  battles:[], totalStudySecs:0, todayStudySecs:0,
  lastStudyDate:null, history:[], calendarData:{},
  sessions:[],
  lastGreetDate:null,
};

// ── 연속 일수 계산 ────────────────────────────────
function calcStreak(calendarData) {
  const keys=Object.keys(calendarData||{})
    .filter(k=>(calendarData[k]?.focusSecs||0)>60)
    .sort().reverse();
  if(keys.length===0) return 0;
  let streak=0;
  const today=todayStr();
  const yesterday=(()=>{ const d=new Date(); if(d.getHours()<5) d.setDate(d.getDate()-1); d.setDate(d.getDate()-1); return localDateStr(d); })();
  // 오늘 또는 어제부터 시작해야 연속
  if(keys[0]!==today&&keys[0]!==yesterday) return 0;
  let cur=new Date(keys[0]+"T12:00:00");
  for(const k of keys){
    const d=new Date(k+"T12:00:00");
    const diff=Math.round((cur-d)/86400000);
    if(diff>1) break;
    streak++;
    cur=d;
  }
  return streak;
}

// ── 캘린더 데이터 병합 (로컬 vs 클라우드 - 더 큰 값 우선) ──
function mergeCalendarData(local, cloud) {
  const merged = {...(cloud||{})};
  Object.entries(local||{}).forEach(([k,v])=>{
    const cloudDay = merged[k];
    merged[k] = {
      focusSecs: Math.max(v.focusSecs||0, cloudDay?.focusSecs||0),
    };
  });
  return merged;
}
function DailyGreet({st,setSt,onDone}) {
  const streak=calcStreak(st.calendarData);
  const today=todayStr();
  const [leaving,setLeaving]=useState(false);

  function handleStart(){
    setLeaving(true);
    setTimeout(()=>onDone(), 900);
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:999,overflow:"hidden",display:"flex",justifyContent:"center",
      animation:leaving?"fadeOut 1.0s ease-out forwards":"none"}}>
      <div style={{width:"100%",maxWidth:430,position:"relative",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"max(env(safe-area-inset-top,40px),40px) 32px 40px"}}>
        <StadiumBg/>
        <div style={{position:"relative",zIndex:1,width:"100%",textAlign:"center"}}>
          {/* 앱 이름 */}
          <p style={{fontFamily:"'Oswald',sans-serif",fontSize:28,color:"#fff",letterSpacing:3,margin:"0 0 4px"}}>STUDY DUEL</p>
          <p style={{fontSize:11,color:"rgba(255,255,255,0.3)",margin:"0 0 36px",letterSpacing:1}}>공부 대결 앱</p>

          {/* 날짜 */}
          <p style={{fontSize:12,color:"rgba(255,255,255,0.4)",margin:"0 0 28px",letterSpacing:2}}>
            {new Date().toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"long"})}
          </p>

          {/* 연속 일수 */}
          <div style={{marginBottom:40}}>
            {streak>=2?(
              <>
                <div style={{fontSize:64,marginBottom:8,display:"inline-block",animation:"flamePulse 1.2s ease-in-out infinite"}}>🔥</div>
                <p style={{fontFamily:"'Oswald',sans-serif",fontSize:64,color:"#f5c518",margin:"0 0 4px",lineHeight:1,animation:"countUp 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards"}}>{streak}</p>
                <p style={{fontFamily:"'Oswald',sans-serif",fontSize:16,color:"rgba(255,255,255,0.7)",letterSpacing:3,margin:"0 0 12px",animation:"fadeSlideUp 0.5s 0.3s ease both"}}>일 연속</p>
                <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",margin:0,animation:"fadeSlideUp 0.5s 0.5s ease both"}}>오늘도 이어가볼까요?</p>
              </>
            ):streak===1?(
              <>
                <div style={{fontSize:56,marginBottom:12,display:"inline-block",animation:"popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards"}}>⚾</div>
                <p style={{fontFamily:"'Oswald',sans-serif",fontSize:24,color:"#fff",letterSpacing:2,margin:"0 0 10px",animation:"fadeSlideUp 0.5s 0.2s ease both"}}>어제 공부했어요!</p>
                <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",margin:0,animation:"fadeSlideUp 0.5s 0.4s ease both"}}>오늘도 공부하면 연속 2일이에요</p>
              </>
            ):(
              <>
                <div style={{fontSize:56,marginBottom:12,display:"inline-block",animation:"popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards"}}>💪</div>
                <p style={{fontFamily:"'Oswald',sans-serif",fontSize:24,color:"#fff",letterSpacing:2,margin:"0 0 10px",animation:"fadeSlideUp 0.5s 0.2s ease both"}}>새로운 하루예요</p>
                <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",margin:0,animation:"fadeSlideUp 0.5s 0.4s ease both"}}>오늘부터 연속 일수를 쌓아봐요!</p>
              </>
            )}
          </div>

          <button onClick={handleStart} style={{
            width:"100%",padding:"14px",
            background:"rgba(255,255,255,0.12)",
            border:"1px solid rgba(255,255,255,0.2)",
            borderRadius:"12px",color:"#fff",
            fontSize:"15px",cursor:"pointer",
            fontFamily:"inherit",letterSpacing:1,
            animation:"fadeSlideUp 0.5s 0.6s ease both",
          }}>시작하기 →</button>

          <p style={{fontSize:10,color:"rgba(255,255,255,0.2)",margin:"16px 0 0"}}>
            {st.nickname}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 야구장 배경 ──────────────────────────────────
function StadiumBg() {
  return (
    <div style={{position:"absolute",inset:0,overflow:"hidden",zIndex:0}}>
      <div style={{position:"absolute",inset:0,background:"#0d1f0d"}}/>
      <div style={{position:"absolute",bottom:"-280px",left:"50%",transform:"translateX(-50%)",width:"700px",height:"700px",borderRadius:"50%",background:"radial-gradient(circle at center,#8b5a2b 0%,#8b5a2b 18%,#1a5c1a 19%,#1d661d 25%,#1a5c1a 31%,#1d661d 37%,#1a5c1a 43%,#1d661d 49%,#1a5c1a 56%,#1d661d 62%,#1a5c1a 70%)"}}/>
      <div style={{position:"absolute",bottom:"120px",left:"50%",transform:"translateX(-50%) rotate(45deg)",width:"190px",height:"190px",background:"#c4893d",border:"3px solid rgba(255,255,255,0.75)"}}/>
      {[{bottom:"313px",left:"50%",transform:"translateX(-50%) rotate(-45deg)"},{bottom:"218px",left:"calc(50% + 95px)",transform:"translateX(-50%) rotate(-45deg)"},{bottom:"120px",left:"50%",transform:"translateX(-50%) rotate(-45deg)"},{bottom:"218px",left:"calc(50% - 95px)",transform:"translateX(-50%) rotate(-45deg)"}].map((s,i)=>(
        <div key={i} style={{position:"absolute",width:"18px",height:"18px",background:"white",borderRadius:"3px",...s}}/>
      ))}
      <div style={{position:"absolute",bottom:"216px",left:"50%",transform:"translateX(-50%)",width:"30px",height:"30px",borderRadius:"50%",background:"#b8763a"}}/>
      <div style={{position:"absolute",bottom:"308px",left:"50%",width:"2px",height:"260px",background:"rgba(255,255,255,0.35)",transformOrigin:"bottom center",transform:"rotate(-42deg)"}}/>
      <div style={{position:"absolute",bottom:"308px",left:"50%",width:"2px",height:"260px",background:"rgba(255,255,255,0.35)",transformOrigin:"bottom center",transform:"rotate(42deg)"}}/>
      {[{top:"30px",left:"20px"},{top:"30px",right:"20px"},{top:"55px",left:"68px"},{top:"55px",right:"68px"}].map((s,i)=>(
        <div key={i} style={{position:"absolute",width:"14px",height:"14px",borderRadius:"50%",background:"#fffde7",boxShadow:"0 0 12px #fffde7, 0 0 24px rgba(255,253,231,0.4)",opacity:0.85,...s}}/>
      ))}
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.54)"}}/>
    </div>
  );
}

function Card({children,style={}}) {
  return <div style={{background:"rgba(0,0,0,0.72)",borderRadius:"16px",border:"1px solid rgba(255,255,255,0.1)",padding:"14px",...style}}>{children}</div>;
}

// ── 온보딩 ──────────────────────────────────────
function Onboarding({onDone}) {
  const [step,setStep]=useState("login"); // "login" | "nickname"
  const [nick,setNick]=useState("");
  const [leaving,setLeaving]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  // 구글 로그인 후 리다이렉트 되어 돌아왔을 때 처리
  useEffect(()=>{
    async function checkSession(){
      const { data:{session} } = await supabase.auth.getSession();
      if(session?.user){
        setStep("nickname");
      }
    }
    checkSession();

    // auth 상태 변화 감지
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((event, session)=>{
      if(event==="SIGNED_IN" && session?.user){
        setStep("nickname");
      }
    });
    return()=>subscription.unsubscribe();
  },[]);

  async function handleGoogleLogin(){
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin }
      });
      if(error) throw error;
    } catch(e) {
      setError("로그인에 실패했어요. 다시 시도해주세요.");
      setLoading(false);
    }
  }

  async function handleNickname(){
    if(!nick.trim()) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const email = session?.user?.email;

      // users 테이블에 저장
      if(userId){
        const { data: existing } = await supabase
          .from("users").select("id,nickname").eq("id",userId).maybeSingle();
        if(!existing){
          await supabase.from("users").insert({
            id: userId,
            nickname: nick.trim(),
            total_study_secs: 0,
            calendar_data: {},
          });
        }
      }

      setLeaving(true);
      setTimeout(()=>onDone(nick.trim(), userId), 900);
    } catch(e){
      setError("오류가 발생했어요.");
      setLoading(false);
    }
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:999,overflow:"hidden",display:"flex",justifyContent:"center",background:"#0d1f0d",
      animation:leaving?"slideOutLeft 1.0s ease-in-out forwards":"none"}}>
      <div style={{width:"100%",maxWidth:430,position:"relative",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"max(env(safe-area-inset-top,32px),32px) 32px 32px"}}>
        <StadiumBg/>
        <div style={{position:"relative",zIndex:1,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:52,marginBottom:16}}>⚾</div>
          <p style={{fontFamily:"'Oswald',sans-serif",fontSize:30,color:"#fff",letterSpacing:3,margin:"0 0 6px"}}>STUDY DUEL</p>
          <p style={{fontSize:13,color:"rgba(255,255,255,0.45)",margin:"0 0 40px"}}>공부 대결 앱</p>

          {step==="login"?(
            <>
              <p style={{fontSize:14,color:"rgba(255,255,255,0.8)",margin:"0 0 20px",fontWeight:500}}>로그인하고 시작하세요</p>
              <button onClick={handleGoogleLogin} disabled={loading}
                style={{width:"100%",padding:"14px",background:"#fff",border:"none",borderRadius:"12px",color:"#333",fontSize:"15px",cursor:"pointer",fontFamily:"inherit",letterSpacing:0.5,display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:12}}>
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                {loading?"로그인 중...":"Google로 시작하기"}
              </button>
              {error&&<p style={{fontSize:11,color:"#ef5350",margin:"8px 0 0"}}>{error}</p>}
            </>
          ):(
            <>
              <p style={{fontSize:14,color:"rgba(255,255,255,0.8)",margin:"0 0 12px",fontWeight:500}}>닉네임을 설정하세요</p>
              <input value={nick} onChange={e=>setNick(e.target.value)} maxLength={15}
                onKeyDown={e=>e.key==="Enter"&&handleNickname()}
                placeholder="닉네임 입력..."
                autoFocus
                style={{width:"100%",background:"rgba(0,0,0,0.6)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:"12px",padding:"14px 16px",color:"#fff",fontSize:"16px",outline:"none",marginBottom:"12px",boxSizing:"border-box",fontFamily:"inherit",textAlign:"center"}}/>
              <p style={{fontSize:10,color:"rgba(255,255,255,0.25)",margin:"0 0 16px"}}>최대 15자</p>
              <button onClick={handleNickname} disabled={loading||!nick.trim()}
                style={{width:"100%",padding:"14px",background:nick.trim()?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:"12px",color:nick.trim()?"#fff":"rgba(255,255,255,0.3)",fontSize:"15px",cursor:nick.trim()?"pointer":"default",fontFamily:"inherit",letterSpacing:1}}>
                {loading?"처리 중...":"시작하기 →"}
              </button>
              {error&&<p style={{fontSize:11,color:"#ef5350",margin:"8px 0 0"}}>{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 퀘스트 섹션 ──────────────────────────────────
function QuestSection({st,setSt,today,compact=false,showTomorrow=true}) {
  const [showAdd,setShowAdd]=useState(false);
  const [newTitle,setNewTitle]=useState("");
  const [scheduleFor,setScheduleFor]=useState("today");
  const todayQuests=st.quests.filter(q=>!q.scheduledFor||q.scheduledFor===today);
  const tmrQuests=st.scheduledQuests.filter(q=>q.scheduledFor===tomorrowStr());

  function addQuest(){
    if(!newTitle.trim())return;
    if(scheduleFor==="today") setSt(p=>({...p,quests:[...p.quests,{id:++_id,title:newTitle.trim(),done:false,date:today}]}));
    else setSt(p=>({...p,scheduledQuests:[...p.scheduledQuests,{id:++_id,title:newTitle.trim(),scheduledFor:tomorrowStr()}]}));
    setNewTitle(""); setShowAdd(false);
  }
  function toggleQuest(id){ setSt(p=>({...p,quests:p.quests.map(q=>q.id===id?{...q,done:!q.done}:q)})); }
  function delQuest(id){ setSt(p=>({...p,quests:p.quests.filter(q=>q.id!==id)})); }
  function delScheduled(id){ setSt(p=>({...p,scheduledQuests:p.scheduledQuests.filter(q=>q.id!==id)})); }

  return (
    <Card style={{padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <p style={{fontSize:9,color:"rgba(255,255,255,0.35)",margin:0,letterSpacing:2}}>TODAY'S QUEST</p>
        {!compact && <button onClick={()=>setShowAdd(v=>!v)} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,padding:"3px 10px",color:"rgba(255,255,255,0.7)",fontSize:11,cursor:"pointer"}}>{showAdd?"취소":"+ 추가"}</button>}
      </div>
      {showAdd&&(
        <div style={{marginBottom:10,display:"flex",flexDirection:"column",gap:8}}>
          <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addQuest()} placeholder="퀘스트 내용..."
            style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"8px 12px",color:"#fff",fontSize:16,outline:"none",fontFamily:"inherit"}}/>
          <div style={{display:"flex",gap:6}}>
            {[["오늘","today"],["내일","tomorrow"]].map(([l,v])=>(
              <button key={v} onClick={()=>setScheduleFor(v)} style={{flex:1,background:scheduleFor===v?"rgba(255,255,255,0.15)":"transparent",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,padding:"7px",color:scheduleFor===v?"#fff":"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer"}}>{l}</button>
            ))}
            <button onClick={addQuest} style={{flex:1,background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,padding:"7px",color:"#fff",fontSize:12,cursor:"pointer"}}>확인</button>
          </div>
        </div>
      )}
      {todayQuests.length===0&&!showAdd&&<p style={{fontSize:12,color:"rgba(255,255,255,0.25)",margin:"8px 0",textAlign:"center"}}>오늘의 퀘스트가 없어요</p>}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {todayQuests.map(q=>(
          <div key={q.id} style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>toggleQuest(q.id)} style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${q.done?"#66bb6a":"rgba(255,255,255,0.3)"}`,background:q.done?"#66bb6a":"transparent",cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {q.done&&<span style={{color:"#fff",fontSize:10}}>✓</span>}
            </button>
            <p style={{flex:1,fontSize:12,color:q.done?"rgba(255,255,255,0.3)":"#fff",margin:0,textDecoration:q.done?"line-through":"none"}}>{q.title}</p>
            {!compact&&<button onClick={()=>delQuest(q.id)} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.2)",cursor:"pointer",fontSize:14,padding:"0 2px"}}>×</button>}
          </div>
        ))}
      </div>
      {showTomorrow&&tmrQuests.length>0&&(
        <>
          <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",margin:"10px 0 8px"}}/>
          <p style={{fontSize:9,color:"rgba(255,255,255,0.25)",margin:"0 0 6px",letterSpacing:2}}>TOMORROW</p>
          {tmrQuests.map(q=>(
            <div key={q.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.2)",flexShrink:0}}/>
              <p style={{flex:1,fontSize:12,color:"rgba(255,255,255,0.4)",margin:0}}>{q.title}</p>
              {!compact&&<button onClick={()=>delScheduled(q.id)} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.2)",cursor:"pointer",fontSize:14,padding:"0 2px"}}>×</button>}
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

// ── 메인 탭 ──────────────────────────────────────
function MainTab({st,setSt,setTab}) {
  const today=todayStr();
  const activeBattles=st.battles.filter(b=>b.status==="active");
  const myStudySecs=st.lastStudyDate===today?st.todayStudySecs:0;
  const [selectedId,setSelectedId]=useState(null);

  // 선택된 대결 or 첫 번째 대결
  const displayBattle=activeBattles.find(b=>b.id===selectedId)||activeBattles[0]||null;

  return (
    <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:"12px"}}>
      {activeBattles.length===0&&(
        <div style={{textAlign:"center",padding:"24px 0"}}>
          <div style={{fontSize:36,marginBottom:10,opacity:0.4}}>⚾</div>
          <p style={{fontSize:14,color:"rgba(255,255,255,0.5)",margin:"0 0 6px"}}>진행 중인 대결이 없어요</p>
          <p style={{fontSize:11,color:"rgba(255,255,255,0.25)",margin:0}}>새 대결을 만들어보세요!</p>
        </div>
      )}

      <button onClick={()=>setTab("battle")} style={{width:"100%",padding:"11px",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:"12px",color:"rgba(255,255,255,0.7)",fontSize:"13px",cursor:"pointer",fontFamily:"inherit"}}>
        + 새 대결 만들기
      </button>

      {/* 대결 여러 개일 때 선택 탭 */}
      {activeBattles.length>1&&(
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {activeBattles.map(b=>(
            <button key={b.id} onClick={()=>setSelectedId(b.id)}
              style={{flexShrink:0,padding:"5px 12px",background:displayBattle?.id===b.id?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.4)",border:`1px solid ${displayBattle?.id===b.id?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.1)"}`,borderRadius:20,color:displayBattle?.id===b.id?"#fff":"rgba(255,255,255,0.4)",fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>
              {b.name||`vs ${b.members?.map(m=>m.name).join(", ")||"?"}`}
            </button>
          ))}
        </div>
      )}

      {/* 선택된 대결 카드 */}
      {displayBattle&&<BattleCard battle={displayBattle} st={st} setSt={setSt} myStudySecs={myStudySecs}/>}

      <QuestSection st={st} setSt={setSt} today={today}/>

      <Card>
        <p style={{fontSize:9,color:"rgba(255,255,255,0.35)",margin:"0 0 8px",letterSpacing:2}}>TODAY</p>
        <p style={{fontFamily:"'Oswald',sans-serif",fontSize:32,color:"#fff",margin:0,lineHeight:1}}>
          {fmtHours(myStudySecs)}<span style={{fontSize:13,color:"rgba(255,255,255,0.3)",marginLeft:6}}>공부 완료</span>
        </p>
        <p style={{fontSize:9,color:"rgba(255,255,255,0.18)",margin:"6px 0 0"}}>오전 5시 기준으로 하루가 바뀌어요</p>
      </Card>
    </div>
  );
}

function BattleCard({battle,st,setSt,myStudySecs}) {
  const today=todayStr();
  const end=new Date(battle.endDate);
  const dLeft=Math.ceil((end-new Date())/86400000);
  const isGroup=(battle.members||[]).length>1;
  const members=[{name:st.nickname||"나",secs:myStudySecs,isMe:true},...(battle.members||[])];
  members.sort((a,b)=>b.secs-a.secs);
  const [codeCopied,setCodeCopied]=useState(false);

  function copyCode(){
    if(!battle.code) return;
    navigator.clipboard.writeText(battle.code).then(()=>{
      setCodeCopied(true);
      setTimeout(()=>setCodeCopied(false),2000);
    });
  }

  return (
    <Card style={{padding:"12px 14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#ef5350"}}/>
          <p style={{fontSize:10,color:"#ef5350",margin:0,letterSpacing:1}}>LIVE</p>
          {battle.name&&<span style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:500}}>{battle.name}</span>}
          {isGroup&&<span style={{fontSize:10,color:"rgba(255,255,255,0.4)",background:"rgba(255,255,255,0.08)",padding:"1px 7px",borderRadius:10}}>그룹 {members.length}명</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {/* 대결 방식 뱃지 */}
          <span style={{fontSize:9,color:battle.mode==="goal"?"#f5c518":"#66bb6a",background:battle.mode==="goal"?"rgba(245,197,24,0.1)":"rgba(102,187,106,0.1)",border:`1px solid ${battle.mode==="goal"?"rgba(245,197,24,0.25)":"rgba(102,187,106,0.25)"}`,padding:"2px 7px",borderRadius:20,letterSpacing:0.5}}>
            {battle.mode==="goal"?`🎯 목표 ${Math.floor((battle.goalSecs||0)/3600)}h`:"⏱ 최다 시간"}
          </span>
          <span style={{fontSize:10,color:"rgba(255,255,255,0.4)",background:"rgba(255,255,255,0.08)",padding:"2px 8px",borderRadius:20}}>D-{Math.max(0,dLeft)}</span>
          {battle.code&&(
            <button onClick={copyCode}
              style={{fontSize:9,color:codeCopied?"#66bb6a":"rgba(255,255,255,0.5)",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",padding:"2px 7px",borderRadius:20,cursor:"pointer",letterSpacing:0.5}}>
              {codeCopied?"✓ 복사됨":`🔑 ${battle.code}`}
            </button>
          )}
          <button onClick={()=>setSt(p=>({...p,battles:p.battles.map(b=>b.id===battle.id?{...b,status:"cancelled"}:b)}))}
            style={{background:"transparent",border:"none",color:"rgba(255,77,109,0.5)",fontSize:16,cursor:"pointer",padding:"0 2px",lineHeight:1}}>×</button>
        </div>
      </div>

      {!isGroup&&(()=>{
        const opp=battle.members?.[0]||{name:"상대",secs:0};
        const diff=myStudySecs-(opp.secs||0);
        const total=myStudySecs+(opp.secs||0)+1;
        const goalSecs=battle.goalSecs||0;
        const myGoalPct=goalSecs>0?Math.min(myStudySecs/goalSecs*100,100):0;
        const oppGoalPct=goalSecs>0?Math.min((opp.secs||0)/goalSecs*100,100):0;
        return (
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(21,101,192,0.9)",border:"2px solid #42a5f5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",margin:"0 auto 4px"}}>{(st.nickname||"나").slice(0,2)}</div>
                <p style={{fontSize:11,color:"rgba(255,255,255,0.7)",margin:"0 0 2px",fontWeight:500}}>{st.nickname||"나"}</p>
                <p style={{fontFamily:"'Oswald',sans-serif",fontSize:18,color:"#42a5f5",margin:0,lineHeight:1,letterSpacing:1}}>{fmtHours(myStudySecs)}</p>
                {battle.mode==="goal"&&<p style={{fontSize:9,color:"rgba(245,197,24,0.7)",margin:"3px 0 0"}}>{myGoalPct.toFixed(0)}%</p>}
              </div>
              <p style={{fontSize:16,color:"rgba(255,255,255,0.2)",margin:0}}>vs</p>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(183,28,28,0.9)",border:"2px solid #ef5350",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",margin:"0 auto 4px"}}>{opp.name.slice(0,2)}</div>
                <p style={{fontSize:11,color:"rgba(255,255,255,0.7)",margin:"0 0 2px",fontWeight:500}}>{opp.name}</p>
                <p style={{fontFamily:"'Oswald',sans-serif",fontSize:18,color:"#ef5350",margin:0,lineHeight:1,letterSpacing:1}}>{fmtHours(opp.secs||0)}</p>
                {battle.mode==="goal"&&<p style={{fontSize:9,color:"rgba(245,197,24,0.7)",margin:"3px 0 0"}}>{oppGoalPct.toFixed(0)}%</p>}
              </div>
            </div>

            {/* 최다 시간: 상대적 비율 바 */}
            {battle.mode==="most"&&(
              <>
                <div style={{background:"rgba(255,255,255,0.1)",borderRadius:3,height:4,marginBottom:6,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.round(myStudySecs/total*100)}%`,background:"#42a5f5",borderRadius:3,animation:"fillBar 0.8s cubic-bezier(0.4,0,0.2,1) forwards","--target-width":`${Math.round(myStudySecs/total*100)}%`}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <p style={{fontSize:11,color:diff>=0?"#42a5f5":"#ef5350",margin:0}}>{diff>=0?`▲ ${fmtHours(diff)} 리드`:`▼ ${fmtHours(-diff)} 뒤처짐`}</p>
                  <p style={{fontSize:11,color:"rgba(255,255,255,0.25)",margin:0}}>벌칙: {battle.penalty}</p>
                </div>
              </>
            )}

            {/* 목표 달성: 각자 목표 대비 진행 바 */}
            {battle.mode==="goal"&&(
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <p style={{fontSize:10,color:"rgba(255,255,255,0.4)",margin:0,width:24,textAlign:"right"}}>{(st.nickname||"나").slice(0,2)}</p>
                  <div style={{flex:1,background:"rgba(255,255,255,0.08)",borderRadius:3,height:6,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${myGoalPct}%`,background:"#42a5f5",borderRadius:3,animation:"fillBar 0.8s cubic-bezier(0.4,0,0.2,1) forwards","--target-width":`${myGoalPct}%`}}/>
                  </div>
                  <p style={{fontSize:9,color:"rgba(66,165,245,0.7)",margin:0,width:28,textAlign:"right"}}>{myGoalPct.toFixed(0)}%</p>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <p style={{fontSize:10,color:"rgba(255,255,255,0.4)",margin:0,width:24,textAlign:"right"}}>{opp.name.slice(0,2)}</p>
                  <div style={{flex:1,background:"rgba(255,255,255,0.08)",borderRadius:3,height:6,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${oppGoalPct}%`,background:"#ef5350",borderRadius:3,animation:"fillBar 0.8s 0.1s cubic-bezier(0.4,0,0.2,1) forwards","--target-width":`${oppGoalPct}%`}}/>
                  </div>
                  <p style={{fontSize:9,color:"rgba(239,83,80,0.7)",margin:0,width:28,textAlign:"right"}}>{oppGoalPct.toFixed(0)}%</p>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
                  <p style={{fontSize:10,color:"rgba(245,197,24,0.6)",margin:0}}>목표 {fmtHours(goalSecs)}</p>
                  <p style={{fontSize:10,color:"rgba(255,255,255,0.25)",margin:0}}>벌칙: {battle.penalty}</p>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {isGroup&&(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {members.map((m,i)=>{
            const goalSecs=battle.goalSecs||0;
            const pct=battle.mode==="goal"&&goalSecs>0?Math.min((m.secs||0)/goalSecs*100,100):0;
            return (
              <div key={i}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:battle.mode==="goal"?4:0}}>
                  <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:i===0?"#f5c518":"rgba(255,255,255,0.3)",width:18}}>{i+1}</div>
                  <div style={{width:28,height:28,borderRadius:"50%",background:m.isMe?"rgba(21,101,192,0.9)":"rgba(80,80,80,0.7)",border:`2px solid ${m.isMe?"#42a5f5":"rgba(255,255,255,0.2)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>{m.name.slice(0,2)}</div>
                  <p style={{flex:1,fontSize:12,color:m.isMe?"#fff":"rgba(255,255,255,0.7)",margin:0,fontWeight:m.isMe?600:400}}>{m.name}{m.isMe?" (나)":""}</p>
                  <p style={{fontFamily:"'Oswald',sans-serif",fontSize:13,color:m.isMe?"#42a5f5":"rgba(255,255,255,0.6)",margin:0}}>{fmtHours(m.secs||0)}</p>
                  {battle.mode==="goal"&&<p style={{fontSize:9,color:"rgba(245,197,24,0.6)",margin:0,minWidth:28,textAlign:"right"}}>{pct.toFixed(0)}%</p>}
                </div>
                {battle.mode==="goal"&&(
                  <div style={{marginLeft:46,background:"rgba(255,255,255,0.08)",borderRadius:3,height:4,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:m.isMe?"#42a5f5":"rgba(255,255,255,0.3)",borderRadius:3,animation:"fillBar 0.8s cubic-bezier(0.4,0,0.2,1) forwards","--target-width":`${pct}%`}}/>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
            {battle.mode==="goal"&&<p style={{fontSize:10,color:"rgba(245,197,24,0.6)",margin:0}}>목표 {fmtHours(battle.goalSecs||0)}</p>}
            <p style={{fontSize:10,color:"rgba(255,255,255,0.25)",margin:"0 0 0 auto"}}>벌칙: {battle.penalty}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── 날짜 범위 피커 ────────────────────────────────
function DateRangePicker({startDate,endDate,onChange}) {
  const now=new Date();
  const [vy,setVy]=useState(now.getFullYear());
  const [vm,setVm]=useState(now.getMonth());
  const [picking,setPicking]=useState("start"); // "start" | "end"

  function toKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
  function parseKey(k){ const p=k.split("-"); return new Date(+p[0],+p[1]-1,+p[2]); }
  function fmtDisp(k){ if(!k) return "?"; const d=parseKey(k); return `${d.getMonth()+1}/${d.getDate()}`; }

  function changeMonth(dir){
    let m=vm+dir, y=vy;
    if(m>11){m=0;y++;} if(m<0){m=11;y--;}
    setVm(m); setVy(y);
  }

  function clickDay(k){
    if(picking==="start"){
      onChange(k, k>endDate?k:endDate);
      setPicking("end");
    } else {
      if(k<startDate){ onChange(k,startDate); }
      else { onChange(startDate,k); }
      setPicking("start");
    }
  }

  const first=new Date(vy,vm,1).getDay();
  const last=new Date(vy,vm+1,0).getDate();
  const todayK=toKey(now);

  const dayBtnBase={width:"100%",aspectRatio:"1",border:"none",borderRadius:6,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"};

  return (
    <div style={{background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:12,padding:"12px"}}>
      {/* 선택 모드 표시 */}
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["start","시작일"],["end","종료일"]].map(([v,l])=>(
          <button key={v} onClick={()=>setPicking(v)} style={{flex:1,padding:"6px",background:picking===v?"rgba(66,165,245,0.2)":"transparent",border:`1px solid ${picking===v?"#42a5f5":"rgba(255,255,255,0.15)"}`,borderRadius:8,color:picking===v?"#42a5f5":"rgba(255,255,255,0.5)",fontSize:11,cursor:"pointer"}}>
            {l}: <span style={{color:"#fff",fontWeight:500}}>{fmtDisp(v==="start"?startDate:endDate)}</span>
          </button>
        ))}
      </div>

      {/* 월 네비게이션 */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <button onClick={()=>changeMonth(-1)} style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,width:34,height:34,color:"#fff",cursor:"pointer",fontSize:18,fontWeight:500}}>‹</button>
        <span style={{fontFamily:"'Oswald',sans-serif",fontSize:13,color:"#fff",letterSpacing:1}}>{vy}년 {vm+1}월</span>
        <button onClick={()=>changeMonth(1)} style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,width:34,height:34,color:"#fff",cursor:"pointer",fontSize:18,fontWeight:500}}>›</button>
      </div>

      {/* 요일 헤더 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {["일","월","화","수","목","금","토"].map(d=>(
          <div key={d} style={{textAlign:"center",fontSize:10,color:"rgba(255,255,255,0.3)",padding:"2px 0"}}>{d}</div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {Array.from({length:first}).map((_,i)=><div key={`e${i}`}/>)}
        {Array.from({length:last},(_,i)=>{
          const d=i+1;
          const k=`${vy}-${String(vm+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const isStart=k===startDate, isEnd=k===endDate;
          const inRange=startDate&&endDate&&k>startDate&&k<endDate;
          const isToday=k===todayK;
          let bg="transparent", color="rgba(255,255,255,0.6)", br=6;
          if(isStart||isEnd){ bg="#42a5f5"; color="#fff"; }
          else if(inRange){ bg="rgba(66,165,245,0.2)"; color="#fff"; br=0; }
          if(isStart&&isEnd){ br=6; }
          else if(isStart){ br="6px 0 0 6px"; }
          else if(isEnd){ br="0 6px 6px 0"; }
          return (
            <button key={k} onClick={()=>clickDay(k)}
              style={{...dayBtnBase,background:bg,color,borderRadius:br,
                outline:isToday&&!isStart&&!isEnd?"1px solid rgba(255,255,255,0.4)":"none",
                fontWeight:isStart||isEnd?600:400}}>
              {d}
            </button>
          );
        })}
      </div>

      {/* 결과 요약 */}
      {startDate&&endDate&&(
        <div style={{marginTop:10,borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:8,display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>{startDate} ~ {endDate}</span>
          <span style={{fontSize:11,color:"#42a5f5",fontWeight:500}}>총 {Math.max(1,Math.ceil((new Date(endDate)-new Date(startDate))/86400000)+1)}일</span>
        </div>
      )}
    </div>
  );
}

// ── 대결 만들기 탭 ────────────────────────────────
function BattleTab({st,setSt,setTab}) {
  const [type,setType]=useState("1v1");
  const [battleName,setBattleName]=useState("");
  const [maxMembers,setMaxMembers]=useState(4);
  const [startDate,setStartDate]=useState(todayStr());
  const [endDate,setEndDate]=useState(()=>{ const d=new Date(); d.setDate(d.getDate()+7); return localDateStr(d); });
  const [mode,setMode]=useState("most");
  const [goalHours,setGoalHours]=useState(30);
  const [penalty,setPenalty]=useState("");
  const [creating,setCreating]=useState(false);
  const [createdBattle,setCreatedBattle]=useState(null); // 생성 완료 후 초대코드 표시용
  const [joinCode,setJoinCode]=useState("");
  const [joining,setJoining]=useState(false);
  const [joinError,setJoinError]=useState("");
  const [tabMode,setTabMode]=useState("create"); // "create" | "join"
  const activeBattle=st.battles.find(b=>b.status==="active");


  async function createBattle(){
    if(!battleName.trim()||!penalty.trim()) return;
    setCreating(true);
    const days=Math.ceil((new Date(endDate)-new Date(startDate))/86400000)+1;

    try {
      // userId 없으면 먼저 유저 등록
      let userId = st.userId;
      if(!userId && st.nickname) {
        const { data: existing } = await supabase
          .from("users").select("id").eq("nickname", st.nickname).maybeSingle();
        if(existing) {
          userId = existing.id;
        } else {
          const { data: newUser } = await supabase
            .from("users").insert({ nickname: st.nickname, total_study_secs: st.totalStudySecs, calendar_data: st.calendarData })
            .select("id").single();
          if(newUser) userId = newUser.id;
        }
        if(userId) setSt(p=>({...p, userId}));
      }
      // 1) Supabase에 대결 생성
      const { data: battleRow, error: bErr } = await supabase
        .from("battles")
        .insert({
          name: battleName.trim(),
          created_by: userId||null,
          type,
          mode,
          goal_secs: goalHours*3600,
          penalty,
          start_date: startDate,
          end_date: endDate,
          status: "active",
        })
        .select()
        .single();

      if(bErr) throw bErr;

      // 2) 나를 battle_members에 추가
      if(userId) {
        await supabase.from("battle_members").insert({
          battle_id: battleRow.id,
          user_id: userId,
          nickname: st.nickname,
          total_secs: st.lastStudyDate===todayStr()?st.todayStudySecs:0,
          today_secs: st.lastStudyDate===todayStr()?st.todayStudySecs:0,
          is_studying: false,
        });
      }

      // 3) 로컬 상태에도 저장
      const battle={
        id: battleRow.id,        // Supabase UUID 사용
        supabaseId: battleRow.id,
        code: battleRow.code,
        type,
        name: battleName.trim()||null,
        members: [],
        maxMembers,
        penalty, mode, days,
        goalSecs: goalHours*3600,
        startDate, endDate,
        status:"active",
        dailyStudy:{},
      };
      setSt(p=>({...p,battles:[...p.battles,battle]}));
      setCreatedBattle({code:battleRow.code, name:battleName.trim()});
    } catch(e) {
      console.error("대결 생성 실패:", e);
      // Supabase 실패해도 로컬에는 저장
      const battle={
        id:++_id, type,
        name:battleName.trim()||null,
        members:[],
        maxMembers,
        penalty, mode, days,
        goalSecs:goalHours*3600,
        startDate, endDate,
        status:"active",
        dailyStudy:{},
      };
      setSt(p=>({...p,battles:[...p.battles,battle]}));
      setTab("main");
    } finally {
      setCreating(false);
    }
  }

  async function joinBattle(){
    if(!joinCode.trim()) return;
    setJoining(true);
    setJoinError("");
    try {
      // 코드로 대결 찾기
      const { data: battleRow, error } = await supabase
        .from("battles")
        .select("*")
        .eq("code", joinCode.trim().toUpperCase())
        .eq("status","active")
        .single();

      if(error || !battleRow) { setJoinError("대결방을 찾을 수 없어요. 코드를 확인해주세요."); return; }

      // 이미 참가한 대결인지 확인
      const already = st.battles.find(b=>b.supabaseId===battleRow.id||b.id===battleRow.id);
      if(already){ setJoinError("이미 참가한 대결이에요."); return; }

      // 멤버로 추가
      if(st.userId){
        await supabase.from("battle_members").insert({
          battle_id: battleRow.id,
          user_id: st.userId,
          nickname: st.nickname,
          total_secs: st.lastStudyDate===todayStr()?st.todayStudySecs:0,
          today_secs: st.lastStudyDate===todayStr()?st.todayStudySecs:0,
          is_studying: false,
        });
      }

      // 기존 멤버 불러오기
      const { data: members } = await supabase
        .from("battle_members")
        .select("*")
        .eq("battle_id", battleRow.id);

      const otherMembers = (members||[])
        .filter(m=>m.user_id!==st.userId)
        .map(m=>({name:m.nickname, secs:m.today_secs||0, isStudying:m.is_studying||false}));

      const battle={
        id: battleRow.id,
        supabaseId: battleRow.id,
        code: battleRow.code,
        type: battleRow.type,
        name: battleRow.name,
        members: otherMembers,
        penalty: battleRow.penalty,
        mode: battleRow.mode,
        goalSecs: battleRow.goal_secs,
        startDate: battleRow.start_date,
        endDate: battleRow.end_date,
        status: "active",
        dailyStudy:{},
      };
      setSt(p=>({...p,battles:[...p.battles,battle]}));
      setTab("main");
    } catch(e){
      setJoinError("오류가 발생했어요. 다시 시도해주세요.");
    } finally {
      setJoining(false);
    }
  }



  // 초대코드 모달
  if(createdBattle) return (
    <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:16,alignItems:"center",justifyContent:"center",minHeight:"60vh"}}>
      <div style={{fontSize:40}}>🎉</div>
      <p style={{fontFamily:"'Oswald',sans-serif",fontSize:18,color:"#fff",letterSpacing:2,margin:0,textAlign:"center"}}>{createdBattle.name}</p>
      <p style={{fontSize:13,color:"rgba(255,255,255,0.5)",margin:0}}>대결이 생성됐어요!</p>
      <Card style={{width:"100%",padding:"20px",textAlign:"center"}}>
        <p style={{fontSize:10,color:"rgba(255,255,255,0.35)",margin:"0 0 10px",letterSpacing:2}}>초대 코드</p>
        <p style={{fontFamily:"'Oswald',sans-serif",fontSize:42,color:"#42a5f5",margin:"0 0 8px",letterSpacing:6}}>{createdBattle.code}</p>
        <p style={{fontSize:11,color:"rgba(255,255,255,0.3)",margin:"0 0 16px"}}>친구에게 이 코드를 알려주세요</p>
        <button onClick={()=>{ navigator.clipboard?.writeText(createdBattle.code); }}
          style={{background:"rgba(66,165,245,0.15)",border:"1px solid rgba(66,165,245,0.3)",borderRadius:10,padding:"10px 24px",color:"#42a5f5",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
          코드 복사 📋
        </button>
      </Card>
      <button onClick={()=>{ setCreatedBattle(null); setTab("main"); }}
        style={{width:"100%",padding:"13px",background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,color:"#fff",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
        홈으로 →
      </button>
    </div>
  );

  return (
    <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:10}}>
      <p style={{fontFamily:"'Oswald',sans-serif",fontSize:16,color:"rgba(255,255,255,0.9)",letterSpacing:2,margin:0}}>대결</p>

      {/* 만들기 / 참가 탭 */}
      <div style={{display:"flex",gap:6}}>
        {[["create","⚔️ 새 대결 만들기"],["join","🔑 코드로 참가"]].map(([v,l])=>(
          <button key={v} onClick={()=>setTabMode(v)}
            style={{flex:1,padding:"9px",background:tabMode===v?"rgba(255,255,255,0.15)":"transparent",border:`1px solid ${tabMode===v?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.12)"}`,borderRadius:10,color:tabMode===v?"#fff":"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer"}}>
            {l}
          </button>
        ))}
      </div>

      {/* 코드로 참가 */}
      {tabMode==="join"&&(
        <Card style={{padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
          <p style={{fontSize:12,color:"rgba(255,255,255,0.6)",margin:0}}>상대방에게 받은 초대코드를 입력하세요</p>
          <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="예: AB12CD"
            maxLength={6}
            style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,padding:"12px",color:"#fff",fontSize:20,outline:"none",fontFamily:"'Oswald',sans-serif",boxSizing:"border-box",textAlign:"center",letterSpacing:6}}/>
          {joinError&&<p style={{fontSize:11,color:"#ef5350",margin:0,textAlign:"center"}}>{joinError}</p>}
          <button onClick={joinBattle} disabled={joining||!joinCode.trim()}
            style={{width:"100%",padding:12,background:joinCode.trim()?"rgba(66,165,245,0.2)":"rgba(255,255,255,0.05)",border:`1px solid ${joinCode.trim()?"rgba(66,165,245,0.4)":"rgba(255,255,255,0.1)"}`,borderRadius:10,color:joinCode.trim()?"#42a5f5":"rgba(255,255,255,0.2)",fontSize:14,cursor:joinCode.trim()?"pointer":"default",fontFamily:"inherit"}}>
            {joining?"참가 중...":"참가하기 →"}
          </button>
        </Card>
      )}

      {/* 새 대결 만들기 */}
      {tabMode==="create"&&(
      <>
      <Card style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:12}}>
        {/* 대결 이름 */}
        <div>
          <p style={{fontSize:10,color:"rgba(255,255,255,0.4)",margin:"0 0 6px",letterSpacing:1}}>대결 이름</p>
          <input value={battleName} onChange={e=>setBattleName(e.target.value)} placeholder="예: 중간고사 대결, 여름방학 챌린지..."
            maxLength={20}
            style={{width:"100%",background:"rgba(255,255,255,0.07)",border:`1px solid ${battleName.trim()?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.12)"}`,borderRadius:8,padding:"9px 12px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>

        {/* 대결 유형 */}
        <div>
          <p style={{fontSize:10,color:"rgba(255,255,255,0.4)",margin:"0 0 6px",letterSpacing:1}}>대결 유형</p>
          <div style={{display:"flex",gap:6}}>
            {[["1v1","1대1"],["group","그룹"]].map(([v,l])=>(
              <button key={v} onClick={()=>{ setType(v); setOpponents([""]); }} style={{flex:1,padding:"9px",background:type===v?"rgba(255,255,255,0.15)":"transparent",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,color:type===v?"#fff":"rgba(255,255,255,0.4)",fontSize:13,cursor:"pointer"}}>{l}</button>
            ))}
          </div>
        </div>

        {/* 최대 인원 */}
        {type==="group"&&(
          <div>
            <p style={{fontSize:10,color:"rgba(255,255,255,0.4)",margin:"0 0 6px",letterSpacing:1}}>최대 인원</p>
            <div style={{display:"flex",gap:6}}>
              {[2,3,4,5,6,8,10].map(n=>(
                <button key={n} onClick={()=>setMaxMembers(n)}
                  style={{flex:1,padding:"8px 0",background:maxMembers===n?"rgba(255,255,255,0.15)":"transparent",border:`1px solid ${maxMembers===n?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.12)"}`,borderRadius:8,color:maxMembers===n?"#fff":"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer"}}>
                  {n}명
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 기간 설정 */}
        <div>
          <p style={{fontSize:10,color:"rgba(255,255,255,0.4)",margin:"0 0 6px",letterSpacing:1}}>기간 설정</p>
          <DateRangePicker
            startDate={startDate} endDate={endDate}
            onChange={(s,e)=>{ setStartDate(s); setEndDate(e); }}
          />
        </div>

        {/* 대결 방식 */}
        <div>
          <p style={{fontSize:10,color:"rgba(255,255,255,0.4)",margin:"0 0 6px",letterSpacing:1}}>대결 방식</p>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setMode("most")} style={{flex:1,padding:"9px",background:mode==="most"?"rgba(255,255,255,0.15)":"transparent",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,color:mode==="most"?"#fff":"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer",lineHeight:1.4}}>
              최다 시간<br/><span style={{fontSize:10,opacity:0.6}}>누가 더 많이?</span>
            </button>
            <button onClick={()=>setMode("goal")} style={{flex:1,padding:"9px",background:mode==="goal"?"rgba(255,255,255,0.15)":"transparent",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,color:mode==="goal"?"#fff":"rgba(255,255,255,0.4)",fontSize:12,cursor:"pointer",lineHeight:1.4}}>
              목표 달성<br/><span style={{fontSize:10,opacity:0.6}}>먼저 채우기</span>
            </button>
          </div>
          {mode==="goal"&&(
            <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
              <p style={{fontSize:12,color:"rgba(255,255,255,0.4)",margin:0}}>목표:</p>
              <button onClick={()=>setGoalHours(h=>Math.max(1,h-5))} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.15)",borderRadius:6,width:28,height:28,color:"#fff",cursor:"pointer",fontSize:14}}>-</button>
              <p style={{fontSize:16,color:"#fff",margin:0,minWidth:40,textAlign:"center"}}>{goalHours}h</p>
              <button onClick={()=>setGoalHours(h=>h+5)} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.15)",borderRadius:6,width:28,height:28,color:"#fff",cursor:"pointer",fontSize:14}}>+</button>
            </div>
          )}
        </div>

        {/* 벌칙 */}
        <div>
          <p style={{fontSize:10,color:"rgba(255,255,255,0.4)",margin:"0 0 6px",letterSpacing:1}}>벌칙</p>
          <input value={penalty} onChange={e=>setPenalty(e.target.value)} placeholder="예: 밥 사기, 아이스크림 사기..."
            style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"9px 12px",color:"#fff",fontSize:16,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>
      </Card>

      <button onClick={createBattle} disabled={creating||!battleName.trim()||!penalty.trim()}
        style={{width:"100%",padding:13,background:battleName.trim()&&penalty.trim()?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,color:battleName.trim()&&penalty.trim()?"#fff":"rgba(255,255,255,0.25)",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
        {creating?"생성 중...":"대결 시작 ⚾"}
      </button>
      </>
      )}

      {/* 진행 중인 대결 목록 */}
      {st.battles.filter(b=>b.status==="active").length>0&&(
        <>
          <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",marginTop:4}}/>
          <p style={{fontFamily:"'Oswald',sans-serif",fontSize:13,color:"rgba(255,255,255,0.5)",letterSpacing:2,margin:0}}>진행 중인 대결</p>
          {st.battles.filter(b=>b.status==="active").map(battle=>(
            <BattleCard key={battle.id} battle={battle} st={st} setSt={setSt}
              myStudySecs={st.lastStudyDate===todayStr()?st.todayStudySecs:0}/>
          ))}
        </>
      )}
    </div>
  );
}

// ── 타이머 전체화면 ───────────────────────────────
function TimerFullscreen({st,setSt,timerSec,swSec,running,setRunning,mode,pomoPhase,pomoSec,onPause,onReset}) {
  const today=todayStr();
  const activeBattles=st.battles.filter(b=>b.status==="active");
  const myStudySecs=st.lastStudyDate===today?st.todayStudySecs:0;
  const [selectedBattleId,setSelectedBattleId]=useState(activeBattles[0]?.id||null);
  const selectedBattle=activeBattles.find(b=>b.id===selectedBattleId)||activeBattles[0]||null;
  const [memberStatus,setMemberStatus]=useState(()=>
    activeBattles.flatMap(b=>(b.members||[]).map(m=>({
      ...m,
      battleId:b.id,
      isStudying:Math.random()>0.4,
      secs:m.secs||0,
      isMe:false,
    })))
  );

  // 공부 중인 멤버 시간 누적 (1초마다)
  useEffect(()=>{
    if(!running) return;
    const t=setInterval(()=>{
      setMemberStatus(prev=>prev.map(m=>m.isStudying?{...m,secs:(m.secs||0)+1}:m));
    },1000);
    return()=>clearInterval(t);
  },[running]);

  // 본인 + 선택된 대결 멤버 합쳐서 시간순 정렬
  const selfEntry={ name:st.nickname||"나", battleId:selectedBattle?.id, isStudying:running, secs:myStudySecs, isMe:true };
  const filteredStatus=[selfEntry,...memberStatus.filter(m=>m.battleId===selectedBattle?.id)]
    .sort((a,b)=>b.secs-a.secs);
  const displaySecs=mode==="pomo"?timerSec:swSec;
  const circumference=2*Math.PI*70;
  const pct=mode==="pomo"?Math.min((pomoSec-timerSec)/pomoSec*100,100):Math.min(swSec/7200*100,100);

  return (
    <div style={{position:"fixed",inset:0,zIndex:900,overflow:"hidden",display:"flex",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:430,position:"relative",height:"100%",display:"flex",flexDirection:"column"}}>
        <StadiumBg/>
        <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",height:"100%",paddingTop:"max(env(safe-area-inset-top),44px)"}}>

          {/* 모드 표시 */}
          <div style={{padding:"8px 16px 6px",textAlign:"center"}}>
            <p style={{fontFamily:"'Oswald',sans-serif",fontSize:13,color:"rgba(255,255,255,0.5)",letterSpacing:2,margin:0}}>
              {mode==="pomo"?(pomoPhase==="work"?"⏰ 집중 시간":"☕ 휴식 시간"):"⏱ 스톱워치"}
            </p>
          </div>

          {/* 타이머 원 */}
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",padding:"8px 0",flexShrink:0}}>
            <div style={{position:"relative",width:160,height:160,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="160" height="160" style={{position:"absolute",transform:"rotate(-90deg)"}}>
                <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7"/>
                <circle cx="80" cy="80" r="70" fill="none"
                  stroke={running?(mode==="pomo"?"#42a5f5":"#66bb6a"):"rgba(255,255,255,0.2)"} strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference*(1-pct/100)}
                  style={{transition:"stroke-dashoffset 1s linear",filter:running?`drop-shadow(0 0 8px ${mode==="pomo"?"#42a5f5":"#66bb6a"})`:"none"}}/>
              </svg>
              <div style={{position:"relative",zIndex:1,textAlign:"center"}}>
                <p style={{fontFamily:"'Oswald',sans-serif",fontSize:34,color:"#fff",margin:0,lineHeight:1,letterSpacing:2}}>{fmtSecs(displaySecs)}</p>
                <p style={{fontSize:9,color:"rgba(255,255,255,0.35)",margin:"3px 0 0"}}>{fmtHours(myStudySecs)} 완료</p>
              </div>
            </div>
          </div>

          {/* 버튼 */}
          <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:10,flexShrink:0}}>
            <button onClick={onPause}
              style={{padding:"9px 24px",background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.25)",borderRadius:10,color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              ⏸ 일시정지
            </button>
            <button onClick={onReset}
              style={{padding:"9px 16px",background:"rgba(239,83,80,0.1)",border:"1px solid rgba(239,83,80,0.25)",borderRadius:10,color:"#ef5350",fontSize:13,cursor:"pointer"}}>
              ↺ 초기화
            </button>
          </div>

          {/* 스크롤 영역 */}
          <div style={{flex:1,overflowY:"auto",padding:"0 16px",display:"flex",flexDirection:"column",gap:10,paddingBottom:20}}>

            {/* 대결 선택 + 멤버 현황 */}
            {activeBattles.length>0&&(
              <Card style={{padding:"10px 14px"}}>
                <p style={{fontSize:9,color:"rgba(255,255,255,0.25)",margin:"0 0 8px",letterSpacing:2}}>멤버 현황</p>

                {/* 대결 여러 개면 선택 탭 */}
                {activeBattles.length>1&&(
                  <div style={{display:"flex",gap:5,overflowX:"auto",marginBottom:10,paddingBottom:2}}>
                    {activeBattles.map(b=>(
                      <button key={b.id} onClick={()=>setSelectedBattleId(b.id)}
                        style={{flexShrink:0,padding:"4px 10px",background:selectedBattle?.id===b.id?"rgba(255,255,255,0.15)":"transparent",border:`1px solid ${selectedBattle?.id===b.id?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.1)"}`,borderRadius:20,color:selectedBattle?.id===b.id?"#fff":"rgba(255,255,255,0.35)",fontSize:10,cursor:"pointer",whiteSpace:"nowrap"}}>
                        {b.name||`vs ${b.members?.map(m=>m.name).join(", ")||"?"}`}
                      </button>
                    ))}
                  </div>
                )}

                {/* 멤버 목록 */}
                {filteredStatus.length>0?(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {filteredStatus.map((m,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,
                        padding:"6px 8px",borderRadius:8,
                        background:m.isMe?"rgba(66,165,245,0.08)":"transparent",
                        border:m.isMe?"1px solid rgba(66,165,245,0.2)":"1px solid transparent"}}>
                        <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
                          background:m.isMe?"#42a5f5":m.isStudying?"#66bb6a":"rgba(255,255,255,0.2)",
                          boxShadow:m.isMe?"0 0 6px #42a5f5":m.isStudying?"0 0 6px #66bb6a":"none"}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <p style={{fontSize:12,color:m.isMe?"#42a5f5":m.isStudying?"#fff":"rgba(255,255,255,0.4)",margin:0,fontWeight:m.isMe?600:400}}>
                            {m.name}{m.isMe?" (나)":""}
                          </p>
                          <p style={{fontSize:9,color:m.isMe?"rgba(66,165,245,0.6)":m.isStudying?"#66bb6a":"rgba(255,255,255,0.2)",margin:"2px 0 0"}}>
                            {m.isStudying||m.isMe?"공부 중":"대기 중"}
                          </p>
                        </div>
                        <p style={{fontFamily:"'Oswald',sans-serif",fontSize:12,margin:0,letterSpacing:0.5,flexShrink:0,
                          color:m.isMe?"#42a5f5":m.isStudying?"#a5d6a7":"rgba(255,255,255,0.2)"}}>
                          {fmtHours(m.secs||0)}
                        </p>
                      </div>
                    ))}
                  </div>
                ):(
                  <p style={{fontSize:11,color:"rgba(255,255,255,0.25)",margin:0,textAlign:"center"}}>멤버가 없어요</p>
                )}
                <p style={{fontSize:8,color:"rgba(255,255,255,0.15)",margin:"8px 0 0",textAlign:"center"}}>Supabase 연동 후 실시간</p>
              </Card>
            )}

            <QuestSection st={st} setSt={setSt} today={today} compact={true} showTomorrow={false}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 타이머 탭 ─────────────────────────────────────
function TimerTab({st,setSt,running,setRunning,tab,setTab}) {
  const [mode,setMode]=useState("pomo");
  const [pomoMin,setPomoMin]=useState(25);
  const [timerSec,setTimerSec]=useState(25*60);
  const [swSec,setSwSec]=useState(0);
  const [pomoPhase,setPomoPhase]=useState("work");
  const [fullscreen,setFullscreen]=useState(false);
  const [pulse,setPulse]=useState(false);
  const hiddenAt=useRef(null);
  const sessionStartRef=useRef(null);
  const pomoSec=pomoMin*60;
  const pct=mode==="pomo"?Math.min((pomoSec-timerSec)/pomoSec*100,100):Math.min(swSec/7200*100,100);
  const circumference=2*Math.PI*80;

  function saveSession(){
    if(!sessionStartRef.current) return;
    const start=sessionStartRef.current;
    const end=Date.now();
    sessionStartRef.current=null;
    if(end-start<5000) return;
    setSt(p=>({...p, sessions:[...(p.sessions||[]),{start,end}]}));

    // Supabase: is_studying=false 로 업데이트
    setSt(p=>{
      if(!p.userId) return p;
      const activeBattles=p.battles.filter(b=>b.status==="active"&&b.supabaseId);
      activeBattles.forEach(async b=>{
        try {
          await supabase.from("battle_members")
            .update({ is_studying:false, last_updated: new Date().toISOString() })
            .eq("battle_id", b.supabaseId)
            .eq("user_id", p.userId);
        } catch(e){}
      });
      return p;
    });
  }

  const syncCountRef=useRef(0);
  useEffect(()=>{
    if(!running)return;
    const t=setInterval(()=>{
      const today=todayStr();
      setSt(p=>{
        const cal={...p.calendarData};
        const dayData=cal[today]||{focusSecs:0};
        cal[today]={...dayData,focusSecs:(dayData.focusSecs||0)+1};
        const newTodaySecs=p.lastStudyDate===today?p.todayStudySecs+1:1;

        // 10초마다 Supabase battle_members 동기화
        syncCountRef.current=(syncCountRef.current||0)+1;
        if(p.userId && syncCountRef.current%10===0){
          const activeBattles=p.battles.filter(b=>b.status==="active"&&b.supabaseId);
          activeBattles.forEach(async b=>{
            try {
              await supabase.from("battle_members")
                .update({ today_secs: newTodaySecs, is_studying:true, last_updated: new Date().toISOString() })
                .eq("battle_id", b.supabaseId)
                .eq("user_id", p.userId);
            } catch(e){}
          });
        }

        return {
          ...p,
          todayStudySecs: newTodaySecs,
          lastStudyDate:today,
          totalStudySecs:p.totalStudySecs+1,
          calendarData:cal,
          battles:p.battles.map(b=>{
            if(b.status!=="active")return b;
            const daily={...(b.dailyStudy||{})};
            daily[today]=(daily[today]||0)+1;
            return {...b,dailyStudy:daily};
          }),
        };
      });
      if(mode==="pomo") setTimerSec(s=>{
        if(s<=1){
          // 뽀모도로 완료 시 세션 저장
          saveSession();
          setRunning(false); setFullscreen(false);
          setPulse(true); setTimeout(()=>setPulse(false),800);
          return pomoSec;
        }
        return s-1;
      });
      else setSwSec(s=>s+1);
    },1000);
    return()=>clearInterval(t);
  },[running,mode,pomoSec]);

  // 앱 닫힘/탭 전환 시 세션 저장
  useEffect(()=>{
    function onHide(){
      if(running && sessionStartRef.current){
        const start=sessionStartRef.current;
        const end=Date.now();
        sessionStartRef.current=null;
        if(end-start>=5000){
          // localStorage에 직접 저장 (setSt 비동기라 beforeunload 때 못 씀)
          try{
            const raw=localStorage.getItem("study-duel");
            const data=raw?JSON.parse(raw):{};
            data.sessions=[...(data.sessions||[]),{start,end}];
            localStorage.setItem("study-duel",JSON.stringify(data));
          }catch{}
        }
      }
    }
    window.addEventListener("beforeunload",onHide);
    // visibilitychange hidden 시에도 임시 저장
    function onVis2(){
      if(document.hidden && running && sessionStartRef.current){
        // 화면 꺼질 때 현재까지 세션 임시 저장 (hiddenAt과 병행)
        const start=sessionStartRef.current;
        const end=Date.now();
        if(end-start>=5000){
          try{
            const raw=localStorage.getItem("study-duel");
            const data=raw?JSON.parse(raw):{};
            // 임시 세션 (화면 켜지면 연장될 수 있음)
            data._pendingSession={start,end};
            localStorage.setItem("study-duel",JSON.stringify(data));
          }catch{}
        }
      } else if(!document.hidden && running){
        // 화면 켜졌을 때 pending 세션 제거하고 sessionStartRef 유지
        try{
          const raw=localStorage.getItem("study-duel");
          const data=raw?JSON.parse(raw):{};
          delete data._pendingSession;
          localStorage.setItem("study-duel",JSON.stringify(data));
        }catch{}
      }
    }
    document.addEventListener("visibilitychange",onVis2);
    return()=>{
      window.removeEventListener("beforeunload",onHide);
      document.removeEventListener("visibilitychange",onVis2);
    };
  },[running]);

  useEffect(()=>{
    function onVis(){
      if(document.hidden){ hiddenAt.current=Date.now(); }
      else if(hiddenAt.current&&running){
        const hiddenTime=hiddenAt.current;
        const now=Date.now();
        hiddenAt.current=null;
        const totalElapsed=Math.floor((now-hiddenTime)/1000);
        if(totalElapsed<=0) return;

        // 5시 경계를 걸치는지 확인 - 숨겨진 시간부터 지금까지 초 단위로 날짜별 분리
        function dateKeyAt(ms){
          const d=new Date(ms);
          if(d.getHours()<5) d.setDate(d.getDate()-1);
          return localDateStr(d);
        }

        const startKey=dateKeyAt(hiddenTime);
        const endKey=dateKeyAt(now);

        setSt(p=>{
          const cal={...p.calendarData};
          let totalSecs=p.totalStudySecs;
          let todaySecs=p.todayStudySecs;
          let lastDate=p.lastStudyDate;

          if(startKey===endKey){
            // 경계 없음 - 전부 같은 날
            const d=cal[endKey]||{focusSecs:0};
            cal[endKey]={...d,focusSecs:(d.focusSecs||0)+totalElapsed};
            todaySecs=lastDate===endKey?todaySecs+totalElapsed:totalElapsed;
            lastDate=endKey;
            totalSecs+=totalElapsed;
          } else {
            // 5시 경계를 걸침 - 날짜별로 분리
            // 경계 시각 계산 (당일 5:00:00)
            const boundary=new Date(now);
            boundary.setHours(5,0,0,0);
            // 만약 현재가 5시 이전이면 어제 5시
            if(new Date(now).getHours()<5) boundary.setDate(boundary.getDate()-1);

            const beforeSecs=Math.max(0,Math.floor((boundary.getTime()-hiddenTime)/1000));
            const afterSecs=Math.max(0,totalElapsed-beforeSecs);

            if(beforeSecs>0){
              const d=cal[startKey]||{focusSecs:0};
              cal[startKey]={...d,focusSecs:(d.focusSecs||0)+beforeSecs};
            }
            if(afterSecs>0){
              const d=cal[endKey]||{focusSecs:0};
              cal[endKey]={...d,focusSecs:(d.focusSecs||0)+afterSecs};
              todaySecs=afterSecs;
            }
            lastDate=endKey;
            totalSecs+=totalElapsed;
          }

          return {
            ...p,
            calendarData:cal,
            todayStudySecs:todaySecs,
            lastStudyDate:lastDate,
            totalStudySecs:totalSecs,
            battles:p.battles.map(b=>{
              if(b.status!=="active")return b;
              const daily={...(b.dailyStudy||{})};
              // 대결도 날짜별로 분리
              if(startKey===endKey){
                daily[endKey]=(daily[endKey]||0)+totalElapsed;
              } else {
                const boundary=new Date(now);
                boundary.setHours(5,0,0,0);
                if(new Date(now).getHours()<5) boundary.setDate(boundary.getDate()-1);
                const beforeSecs=Math.max(0,Math.floor((boundary.getTime()-hiddenTime)/1000));
                const afterSecs=Math.max(0,totalElapsed-beforeSecs);
                if(beforeSecs>0) daily[startKey]=(daily[startKey]||0)+beforeSecs;
                if(afterSecs>0) daily[endKey]=(daily[endKey]||0)+afterSecs;
              }
              return {...b,dailyStudy:daily};
            }),
          };
        });

        if(mode==="pomo") setTimerSec(s=>Math.max(0,s-totalElapsed));
        else setSwSec(s=>s+totalElapsed);
      }
    }
    document.addEventListener("visibilitychange",onVis);
    return()=>document.removeEventListener("visibilitychange",onVis);
  },[running,mode]);

  const today=todayStr();
  const myStudySecs=st.lastStudyDate===today?st.todayStudySecs:0;

  if(fullscreen) return (
    <TimerFullscreen
      st={st} setSt={setSt}
      timerSec={timerSec} swSec={swSec}
      running={running} setRunning={setRunning}
      mode={mode} pomoPhase={pomoPhase} pomoSec={pomoSec}
      onPause={()=>{ saveSession(); setRunning(false); setFullscreen(false); }}
      onReset={()=>{ saveSession(); setRunning(false); setTimerSec(pomoSec); setSwSec(0); setFullscreen(false); }}/>
  );

  return (
    <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
      {/* 모드 선택 - 실행 중이면 잠금 */}
      <div style={{display:"flex",gap:6,position:"relative"}}>
        {[["pomo","🍅 뽀모도로"],["stopwatch","⏱ 스톱워치"]].map(([m,l])=>(
          <button key={m} onClick={()=>{
            if(running){ return; }
            setMode(m); setRunning(false); setTimerSec(pomoSec); setSwSec(0);
          }}
            style={{flex:1,padding:"9px",background:mode===m?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.4)",border:`1px solid ${running&&mode!==m?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.12)"}`,borderRadius:10,color:mode===m?"#fff":running?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.4)",fontSize:12,cursor:running&&mode!==m?"not-allowed":"pointer"}}>
            {l}
          </button>
        ))}
        {running&&<div style={{position:"absolute",inset:0,borderRadius:10,cursor:"not-allowed"}}/>}
      </div>

      {/* 타이머 원 */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"8px 0"}}>
        {mode==="pomo"&&!running&&(
          <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
            <button onClick={()=>{
              const next=Math.max(1,pomoMin-1);
              setPomoMin(next); setTimerSec(next*60);
            }} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,width:32,height:32,color:"#fff",cursor:"pointer",fontSize:16}}>-</button>
            <input
              type="number" value={pomoMin} min="1" max="180"
              onChange={e=>{
                const v=Math.max(1,Math.min(180,parseInt(e.target.value)||1));
                setPomoMin(v); setTimerSec(v*60);
              }}
              style={{width:56,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,padding:"6px",color:"#fff",fontSize:16,outline:"none",textAlign:"center",fontFamily:"inherit"}}/>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.5)",margin:0}}>분</p>
            <button onClick={()=>{
              const next=Math.min(180,pomoMin+1);
              setPomoMin(next); setTimerSec(next*60);
            }} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,width:32,height:32,color:"#fff",cursor:"pointer",fontSize:16}}>+</button>
          </div>
        )}
        <div style={{position:"relative",width:200,height:200,display:"flex",alignItems:"center",justifyContent:"center",
          borderRadius:"50%",animation:pulse?"timerPulse 0.8s ease-out":"none"}}>
          <svg width="200" height="200" style={{position:"absolute",transform:"rotate(-90deg)"}}>
            <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8"/>
            <circle cx="100" cy="100" r="80" fill="none"
              stroke={mode==="pomo"?"#42a5f5":"#66bb6a"} strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference*(1-pct/100)}
              style={{transition:"stroke-dashoffset 1s linear",filter:`drop-shadow(0 0 ${running?8:4}px ${mode==="pomo"?"#42a5f5":"#66bb6a"})`}}/>
          </svg>
          <div style={{position:"relative",textAlign:"center",zIndex:1}}>
            <p style={{fontFamily:"'Oswald',sans-serif",fontSize:40,color:"#fff",margin:0,lineHeight:1,letterSpacing:2}}>
              {mode==="pomo"?fmtSecs(timerSec):fmtSecs(swSec)}
            </p>
            <p style={{fontSize:10,color:"rgba(255,255,255,0.35)",margin:"4px 0 0"}}>
              {mode==="pomo"?(pomoPhase==="work"?"집중 시간":"휴식 시간"):"경과 시간"}
            </p>
          </div>
        </div>

        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={()=>{
            sessionStartRef.current=Date.now();
            setRunning(true);
            setFullscreen(true);
            // Supabase: is_studying=true 업데이트
            const activeBattles=st.battles.filter(b=>b.status==="active"&&b.supabaseId);
            if(st.userId && activeBattles.length){
              activeBattles.forEach(async b=>{
                try {
                  await supabase.from("battle_members")
                    .update({ is_studying:true, last_updated: new Date().toISOString() })
                    .eq("battle_id", b.supabaseId)
                    .eq("user_id", st.userId);
                } catch(e){}
              });
            }
          }}
            disabled={running}
            style={{padding:"11px 28px",background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.25)",borderRadius:12,color:"#fff",fontSize:14,cursor:"pointer",fontFamily:"inherit",opacity:running?0.4:1}}>
            ▶ 시작
          </button>
          <button onClick={()=>{ setRunning(false); setTimerSec(pomoSec); setSwSec(0); }}
            style={{padding:"11px 16px",background:"rgba(239,83,80,0.1)",border:"1px solid rgba(239,83,80,0.25)",borderRadius:12,color:"#ef5350",fontSize:14,cursor:"pointer"}}>↺</button>
        </div>
      </div>

      <Card style={{padding:"12px 14px"}}>
        <p style={{fontSize:9,color:"rgba(255,255,255,0.35)",margin:"0 0 6px",letterSpacing:2}}>TODAY</p>
        <p style={{fontFamily:"'Oswald',sans-serif",fontSize:28,color:"#fff",margin:0}}>
          {fmtHours(myStudySecs)}<span style={{fontSize:12,color:"rgba(255,255,255,0.3)",marginLeft:8}}>공부 완료</span>
        </p>
        <p style={{fontSize:9,color:"rgba(255,255,255,0.18)",margin:"6px 0 0"}}>오전 5시 기준으로 하루가 바뀌어요</p>
      </Card>
    </div>
  );
}

// ── 전적 탭 ───────────────────────────────────────
function HistoryTab({st}) {
  const wins=st.history.filter(h=>h.result==="win").length;
  const loses=st.history.filter(h=>h.result==="lose").length;
  return (
    <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        {[["총 대결",st.history.length+"회","#fff"],["승리",wins+"승","#42a5f5"],["패배",loses+"패","#ef5350"]].map(([l,v,c])=>(
          <div key={l} style={{background:"rgba(0,0,0,0.72)",borderRadius:12,border:"1px solid rgba(255,255,255,0.08)",padding:"12px 8px",textAlign:"center"}}>
            <p style={{fontFamily:"'Oswald',sans-serif",fontSize:22,color:c,margin:"0 0 2px"}}>{v}</p>
            <p style={{fontSize:10,color:"rgba(255,255,255,0.3)",margin:0}}>{l}</p>
          </div>
        ))}
      </div>
      {st.history.length===0?(
        <div style={{textAlign:"center",padding:"40px 0"}}>
          <p style={{fontSize:13,color:"rgba(255,255,255,0.3)",margin:0}}>아직 완료된 대결이 없어요</p>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[...st.history].reverse().map(h=>(
            <Card key={h.id} style={{padding:"12px 14px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <p style={{fontSize:13,color:"#fff",margin:"0 0 3px"}}>vs {h.opponent}</p>
                  <p style={{fontSize:10,color:"rgba(255,255,255,0.3)",margin:0}}>{h.date} · {h.penalty}</p>
                </div>
                <div style={{textAlign:"right"}}>
                  <p style={{fontSize:15,fontWeight:500,margin:"0 0 2px",color:h.result==="win"?"#42a5f5":"#ef5350"}}>{h.result==="win"?"🏆 승리":"😢 패배"}</p>
                  <p style={{fontSize:10,color:"rgba(255,255,255,0.3)",margin:0}}>{fmtHours(h.mySecs)} vs {fmtHours(h.opponentSecs)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 달력 탭 ───────────────────────────────────────
function CalendarTab({st,setSt}) {
  const now=new Date();
  const [viewYear,setViewYear]=useState(now.getFullYear());
  const [viewMonth,setViewMonth]=useState(now.getMonth());
  const year=viewYear, month=viewMonth;
  const first=new Date(year,month,1).getDay(), days=new Date(year,month+1,0).getDate();
  const cells=[]; for(let i=0;i<first;i++) cells.push(null); for(let d=1;d<=days;d++) cells.push(d);
  const [selectedDay,setSelectedDay]=useState(null);
  const [editingSession,setEditingSession]=useState(null); // {idx, start, end}
  const [editH,setEditH]=useState("0");
  const [editM,setEditM]=useState("0");

  const monthPrefix=`${year}-${String(month+1).padStart(2,"0")}`;
  const monthDays=Object.entries(st.calendarData||{}).filter(([k])=>k.startsWith(monthPrefix));
  const monthFocusSecs=monthDays.reduce((s,[,v])=>s+(v.focusSecs||0),0);

  // 이번 주 (월요일 기준) 누적
  const weekFocusSecs=(()=>{
    const today=new Date();
    if(today.getHours()<5) today.setDate(today.getDate()-1);
    const dow=today.getDay(); // 0=일
    const mondayOffset=dow===0?6:dow-1;
    const monday=new Date(today);
    monday.setDate(today.getDate()-mondayOffset);
    monday.setHours(0,0,0,0);
    return Object.entries(st.calendarData||{}).reduce((sum,[k,v])=>{
      const d=new Date(k+"T12:00:00"); // 로컬 정오 기준
      return d>=monday?sum+(v.focusSecs||0):sum;
    },0);
  })();

  function fmtH(s){ return fmtHours(s); }

  const selectedKey=selectedDay?`${year}-${String(month+1).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}`:null;
  const selectedInfo=selectedKey?st.calendarData[selectedKey]:null;

  function openSessionEdit(sess,globalIdx){
    const ms=sess.end-sess.start;
    setEditH(String(Math.floor(ms/3600000)));
    setEditM(String(Math.floor((ms%3600000)/60000)));
    setEditingSession({globalIdx, start:sess.start, end:sess.end});
  }

  function saveSessionEdit(){
    if(!editingSession) return;
    const newMs=Math.max(60000,(parseInt(editH)||0)*3600000+(parseInt(editM)||0)*60000);
    const oldMs=editingSession.end-editingSession.start;
    const diffSecs=Math.round((newMs-oldMs)/1000);
    // end를 start 기준으로 새로 계산 (줄이기만 가능)
    if(newMs>=oldMs){ setEditingSession(null); return; }
    const newEnd=editingSession.start+newMs;
    setSt(p=>{
      const sessions=[...(p.sessions||[])];
      sessions[editingSession.globalIdx]={...sessions[editingSession.globalIdx],end:newEnd};
      const cal={...p.calendarData};
      const d=cal[selectedKey]||{focusSecs:0};
      cal[selectedKey]={...d,focusSecs:Math.max(0,(d.focusSecs||0)+diffSecs)};
      return {
        ...p, sessions,
        calendarData:cal,
        totalStudySecs:Math.max(0,(p.totalStudySecs||0)+diffSecs),
        todayStudySecs:p.lastStudyDate===selectedKey?Math.max(0,(p.todayStudySecs||0)+diffSecs):p.todayStudySecs,
      };
    });
    setEditingSession(null);
  }

  return (
    <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <button onClick={()=>{
          if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}
          else setViewMonth(m=>m-1);
          setSelectedDay(null); setEditingSession(null);
        }} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,width:32,height:32,color:"rgba(255,255,255,0.6)",cursor:"pointer",fontSize:16}}>‹</button>
        <p style={{fontFamily:"'Oswald',sans-serif",fontSize:13,color:"rgba(255,255,255,0.6)",letterSpacing:2,margin:0}}>
          {new Date(year,month,1).toLocaleDateString("ko-KR",{year:"numeric",month:"long"})}
          {(year!==now.getFullYear()||month!==now.getMonth())&&(
            <button onClick={()=>{setViewYear(now.getFullYear());setViewMonth(now.getMonth());setSelectedDay(null);setEditingSession(null);}}
              style={{marginLeft:8,background:"transparent",border:"1px solid rgba(255,255,255,0.15)",borderRadius:6,padding:"1px 7px",color:"rgba(255,255,255,0.4)",fontSize:10,cursor:"pointer"}}>
              오늘
            </button>
          )}
        </p>
        <button onClick={()=>{
          if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}
          else setViewMonth(m=>m+1);
          setSelectedDay(null); setEditingSession(null);
        }} disabled={year===now.getFullYear()&&month===now.getMonth()}
          style={{background:"transparent",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,width:32,height:32,color:year===now.getFullYear()&&month===now.getMonth()?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.6)",cursor:year===now.getFullYear()&&month===now.getMonth()?"default":"pointer",fontSize:16}}>›</button>
      </div>

      <Card style={{padding:"12px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:6}}>
          {["일","월","화","수","목","금","토"].map(d=>(
            <div key={d} style={{textAlign:"center",fontSize:9,color:"rgba(255,255,255,0.3)",padding:"2px 0"}}>{d}</div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {cells.map((d,i)=>{
            if(!d) return <div key={`e${i}`}/>;
            const key=`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const info=st.calendarData?.[key];
            const isToday=d===now.getDate();
            const hasFocus=info&&(info.focusSecs||0)>60;
            const isSelected=d===selectedDay;
            return (
              <div key={d} onClick={()=>{ setSelectedDay(isSelected?null:d); setEditingSession(null); }}
                style={{borderRadius:6,padding:"4px 2px",textAlign:"center",minHeight:38,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",
                  border:`1px solid ${isSelected?"#42a5f5":isToday?"rgba(255,255,255,0.4)":hasFocus?"rgba(102,187,106,0.3)":"rgba(255,255,255,0.05)"}`,
                  background:isSelected?"rgba(66,165,245,0.15)":hasFocus?"rgba(102,187,106,0.08)":"rgba(255,255,255,0.03)"}}>
                <div style={{fontSize:9,color:isSelected?"#42a5f5":isToday?"#fff":hasFocus?"#a5d6a7":"rgba(255,255,255,0.4)",fontWeight:isToday?700:400}}>{d}</div>
                {hasFocus&&<div style={{fontSize:7,color:"rgba(102,187,106,0.8)",marginTop:1}}>{Math.floor((info.focusSecs||0)/3600)}h</div>}
              </div>
            );
          })}
        </div>
      </Card>

      {selectedDay&&(
        <Card style={{padding:"12px 14px"}}>
          <p style={{fontSize:10,color:"rgba(255,255,255,0.35)",margin:"0 0 8px",letterSpacing:1}}>{month+1}월 {selectedDay}일</p>
          {selectedInfo?(
            <div style={{textAlign:"center"}}>
              <p style={{fontFamily:"'Oswald',sans-serif",fontSize:22,color:"#66bb6a",margin:"0 0 2px"}}>{fmtH(selectedInfo.focusSecs||0)}</p>
              <p style={{fontSize:9,color:"rgba(255,255,255,0.3)",margin:0}}>총 공부 시간 · 세션 클릭해서 줄이기 가능</p>
            </div>
          ):(
            <p style={{fontSize:12,color:"rgba(255,255,255,0.25)",margin:0,textAlign:"center"}}>기록 없음</p>
          )}
        </Card>
      )}

      {/* 타임라인 */}
      {selectedDay&&(()=>{
        // 선택된 날의 세션 필터 (새벽 5시 기준), globalIdx 포함
        const dayStart=new Date(`${selectedKey}T05:00:00`).getTime();
        const dayEnd=dayStart+24*3600*1000;
        const daySessions=(st.sessions||[])
          .map((s,gi)=>({...s,gi}))
          .filter(s=>s.end>dayStart&&s.start<dayEnd)
          .map(s=>({gi:s.gi,start:Math.max(s.start,dayStart),end:Math.min(s.end,dayEnd)}))
          .sort((a,b)=>a.start-b.start);

        if(daySessions.length===0) return null;

        function fmtTime(ts){
          const d=new Date(ts);
          return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
        }
        function fmtDur(ms){
          const s=Math.floor(ms/1000);
          const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);
          if(h>0) return `${h}시간 ${m}분`;
          return `${m}분`;
        }

        // 세션 + 휴식 교차 목록 생성
        const items=[];
        daySessions.forEach((sess,i)=>{
          if(i>0){
            const restMs=sess.start-daySessions[i-1].end;
            if(restMs>60000) items.push({type:"rest",ms:restMs});
          }
          items.push({type:"study",gi:sess.gi,start:sess.start,end:sess.end,ms:sess.end-sess.start});
        });

        return (
          <Card style={{padding:"12px 14px"}}>
            <p style={{fontSize:9,color:"rgba(255,255,255,0.25)",margin:"0 0 12px",letterSpacing:2}}>공부 타임라인 · 세션 클릭해서 줄이기</p>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {items.map((item,i)=>{
                if(item.type==="rest") return (
                  <div key={i} style={{display:"flex",gap:0,alignItems:"stretch"}}>
                    <div style={{width:44,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <div style={{flex:1,width:1,background:"rgba(255,255,255,0.08)"}}/>
                    </div>
                    <div style={{flex:1,padding:"6px 0 6px 10px",display:"flex",alignItems:"center"}}>
                      <span style={{fontSize:10,color:"rgba(255,255,255,0.25)"}}>💤 휴식 {fmtDur(item.ms)}</span>
                    </div>
                  </div>
                );
                const sesIdx=items.filter(x=>x.type==="study").indexOf(item)+1;
                const barH=Math.max(44,Math.floor(item.ms/1000/60)*1.5);
                const isEditingThis=editingSession?.globalIdx===item.gi;
                return (
                  <div key={i} style={{display:"flex",gap:0,alignItems:"flex-start"}}>
                    {/* 왼쪽 시간축 */}
                    <div style={{width:44,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center"}}>
                      <span style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:4}}>{fmtTime(item.start)}</span>
                      <div style={{width:2,height:barH,background:isEditingThis?"#f5c518":"#42a5f5",borderRadius:2}}/>
                      <span style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginTop:4}}>{fmtTime(item.end)}</span>
                    </div>
                    {/* 오른쪽 카드 */}
                    <div onClick={()=>!isEditingThis&&openSessionEdit({start:item.start,end:item.end},item.gi)}
                      style={{flex:1,marginLeft:10,marginTop:2,background:isEditingThis?"rgba(245,197,24,0.08)":"rgba(66,165,245,0.1)",border:`1px solid ${isEditingThis?"rgba(245,197,24,0.3)":"rgba(66,165,245,0.2)"}`,borderRadius:10,padding:"8px 12px",cursor:isEditingThis?"default":"pointer"}}>
                      {!isEditingThis?(
                        <>
                          <p style={{fontFamily:"'Oswald',sans-serif",fontSize:15,color:"#42a5f5",margin:"0 0 2px"}}>{fmtDur(item.ms)}</p>
                          <p style={{fontSize:10,color:"rgba(255,255,255,0.35)",margin:0}}>세션 {sesIdx} · 눌러서 수정</p>
                        </>
                      ):(
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          <p style={{fontSize:10,color:"rgba(245,197,24,0.7)",margin:0}}>줄일 시간 입력 (현재 {fmtDur(item.ms)})</p>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <input type="number" value={editH} onChange={e=>setEditH(e.target.value)} min="0" max="24"
                              style={{width:44,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:7,padding:"6px",color:"#fff",fontSize:16,outline:"none",textAlign:"center"}}/>
                            <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>h</span>
                            <input type="number" value={editM} onChange={e=>setEditM(e.target.value)} min="0" max="59"
                              style={{width:44,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:7,padding:"6px",color:"#fff",fontSize:16,outline:"none",textAlign:"center"}}/>
                            <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>m</span>
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={e=>{e.stopPropagation();setEditingSession(null);}} style={{flex:1,padding:"6px",background:"transparent",border:"1px solid rgba(255,255,255,0.12)",borderRadius:7,color:"rgba(255,255,255,0.4)",fontSize:11,cursor:"pointer"}}>취소</button>
                            <button onClick={e=>{e.stopPropagation();saveSessionEdit();}} style={{flex:1,padding:"6px",background:"rgba(245,197,24,0.12)",border:"1px solid rgba(245,197,24,0.3)",borderRadius:7,color:"#f5c518",fontSize:11,cursor:"pointer"}}>저장</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Card style={{padding:"12px",textAlign:"center"}}>
          <p style={{fontFamily:"'Oswald',sans-serif",fontSize:22,color:"#42a5f5",margin:"0 0 3px"}}>{fmtH(weekFocusSecs)}</p>
          <p style={{fontSize:9,color:"rgba(255,255,255,0.3)",margin:0}}>이번 주 공부</p>
        </Card>
        <Card style={{padding:"12px",textAlign:"center"}}>
          <p style={{fontFamily:"'Oswald',sans-serif",fontSize:22,color:"#66bb6a",margin:"0 0 3px"}}>{fmtH(monthFocusSecs)}</p>
          <p style={{fontSize:9,color:"rgba(255,255,255,0.3)",margin:0}}>이번 달 공부</p>
        </Card>
      </div>

      <Card style={{padding:"12px 14px"}}>
        <p style={{fontSize:9,color:"rgba(255,255,255,0.25)",margin:"0 0 10px",letterSpacing:2}}>요일별 패턴</p>
        {(()=>{
          const dowSecs=[0,0,0,0,0,0,0];
          Object.entries(st.calendarData||{}).forEach(([k,v])=>{
            if(v.focusSecs>0) dowSecs[new Date(k).getDay()]+=v.focusSecs;
          });
          const max=Math.max(...dowSecs,1);
          return (
            <div style={{display:"flex",gap:6,alignItems:"flex-end",height:50}}>
              {["일","월","화","수","목","금","토"].map((d,i)=>(
                <div key={d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <div style={{width:"100%",background:`rgba(102,187,106,${0.15+dowSecs[i]/max*0.6})`,borderRadius:3,height:`${Math.max(dowSecs[i]/max*100,8)}%`,minHeight:4,transition:"height .3s"}}/>
                  <div style={{fontSize:8,color:"rgba(255,255,255,0.3)"}}>{d}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </Card>
    </div>
  );
}

// ── 개발자 패널 ───────────────────────────────────
// ── 메인 앱 ───────────────────────────────────────
const TABS=[{id:"main",icon:"🏠",label:"홈"},{id:"battle",icon:"⚔️",label:"대결"},{id:"timer",icon:"⏰",label:"타이머"},{id:"calendar",icon:"📅",label:"달력"},{id:"history",icon:"🏆",label:"전적"}];

export default function App() {
  const [st,setSt]=useState(()=>{
    try{
      const s=localStorage.getItem("study-duel");
      const data=s?JSON.parse(s):DEF;
      if(data._pendingSession){
        const {start,end}=data._pendingSession;
        if(end-start>=5000){ data.sessions=[...(data.sessions||[]),{start,end}]; }
        delete data._pendingSession;
      }
      return {...DEF,...data};
    }catch{return DEF;}
  });
  const [tab,setTab]=useState("main");
  const [timerRunning,setTimerRunning]=useState(false);
  const [editingNick,setEditingNick]=useState(false);
  const [nickInput,setNickInput]=useState("");
  const [authLoading,setAuthLoading]=useState(true); // 세션 확인 전 로딩

  // 화면 전환: "onboarding" | "greet" | "main"
  const today=todayStr();
  const initScreen=!st.onboardingDone?"onboarding":st.lastGreetDate!==today?"greet":"main";
  const [screen,setScreen]=useState(initScreen);
  // 각 레이어 visible 여부 (opacity+transform transition으로 제어)
  const [mainVis,setMainVis]=useState(initScreen==="main");
  const [greetVis,setGreetVis]=useState(initScreen==="greet");
  const [onbVis,setOnbVis]=useState(initScreen==="onboarding");

  useEffect(()=>{ try{localStorage.setItem("study-duel",JSON.stringify(st));}catch{} },[st]);

  // ── Supabase Auth: 로그인 상태 감지 ──
  useEffect(()=>{
    // 5초 후에도 로딩 중이면 강제로 풀기
    const timeout = setTimeout(()=>{ setAuthLoading(false); setOnbVis(true); }, 5000);

    // 1) 먼저 리스너 등록
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session)=>{
      clearTimeout(timeout);
      if((event==="SIGNED_IN"||event==="TOKEN_REFRESHED") && session?.user){
        const { data: userData } = await supabase
          .from("users").select("id,nickname,total_study_secs,calendar_data")
          .eq("id", session.user.id).maybeSingle();
        if(userData?.nickname){
          setSt(p=>({
            ...p,
            userId: userData.id,
            nickname: userData.nickname,
            onboardingDone: true,
            totalStudySecs: Math.max(p.totalStudySecs, userData.total_study_secs||0),
            calendarData: mergeCalendarData(p.calendarData, userData.calendar_data||{}),
          }));
          setMainVis(true);
          setOnbVis(false);
          setScreen("main");
        } else {
          setOnbVis(true);
        }
        setAuthLoading(false);
      } else if(event==="SIGNED_OUT"){
        setSt({...DEF});
        setScreen("onboarding");
        setOnbVis(true);
        setMainVis(false);
        setAuthLoading(false);
      } else if(event==="INITIAL_SESSION"){
        if(!session){
          setOnbVis(true);
        }
        setAuthLoading(false);
      } else {
        setAuthLoading(false);
      }
    });

    // Supabase가 detectSessionInUrl로 자동 처리
    // 코드 교환만 처리 (PKCE fallback)
    async function handleCode(){
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      if(code){
        window.history.replaceState(null,"",window.location.pathname);
        await supabase.auth.exchangeCodeForSession(code);
      }
    }
    handleCode();

    return()=>{ subscription.unsubscribe(); clearTimeout(timeout); };
  },[]);
  useEffect(()=>{
    if(!st.onboardingDone||!st.nickname) return;
    if(st.userId) return;

    async function registerUser(){
      try {
        // 닉네임으로 기존 유저 찾기
        const { data: existing } = await supabase
          .from("users")
          .select("id, total_study_secs, calendar_data")
          .eq("nickname", st.nickname)
          .maybeSingle();

        if(existing){
          // 기존 유저 → 클라우드 데이터로 병합 (더 큰 값 우선)
          setSt(p=>({
            ...p,
            userId: existing.id,
            totalStudySecs: Math.max(p.totalStudySecs, existing.total_study_secs||0),
            calendarData: existing.calendar_data
              ? mergeCalendarData(p.calendarData, existing.calendar_data)
              : p.calendarData,
          }));
        } else {
          // 신규 유저 생성
          const { data: newUser } = await supabase
            .from("users")
            .insert({ nickname: st.nickname, total_study_secs: st.totalStudySecs, calendar_data: st.calendarData })
            .select("id")
            .single();
          if(newUser) setSt(p=>({...p, userId: newUser.id}));
        }
      } catch(e){ console.error("유저 등록 실패:", e); }
    }
    registerUser();
  },[st.onboardingDone, st.nickname]);

  // ── Supabase: 공부 데이터 30초마다 백업 ──
  useEffect(()=>{
    if(!st.userId) return;
    const t=setInterval(async()=>{
      try {
        await supabase.from("users").update({
          total_study_secs: st.totalStudySecs,
          calendar_data: st.calendarData,
          last_study_date: st.lastStudyDate,
        }).eq("id", st.userId);
      } catch(e){ console.error("백업 실패:", e); }
    }, 30000);
    return()=>clearInterval(t);
  },[st.userId, st.totalStudySecs]);

  // ── Supabase: 대결 멤버 실시간 구독 ──
  useEffect(()=>{
    const activeBattleIds = st.battles
      .filter(b=>b.status==="active"&&b.supabaseId)
      .map(b=>b.supabaseId);
    if(!activeBattleIds.length) return;

    const channel = supabase
      .channel("battle-members-realtime")
      .on("postgres_changes",{
        event:"*", schema:"public", table:"battle_members",
      }, payload=>{
        const row = payload.new;
        if(!row||!activeBattleIds.includes(row.battle_id)) return;
        // 내 자신은 업데이트 무시
        if(row.user_id===st.userId) return;
        // 해당 대결의 members 업데이트
        setSt(p=>({
          ...p,
          battles: p.battles.map(b=>{
            if(b.supabaseId!==row.battle_id) return b;
            const exists = (b.members||[]).find(m=>m.userId===row.user_id);
            if(exists){
              return {...b, members: b.members.map(m=>
                m.userId===row.user_id
                  ? {...m, secs:row.today_secs||0, isStudying:row.is_studying||false}
                  : m
              )};
            } else {
              return {...b, members:[...(b.members||[]),{
                userId: row.user_id,
                name: row.nickname,
                secs: row.today_secs||0,
                isStudying: row.is_studying||false,
              }]};
            }
          }),
        }));
      })
      .subscribe();

    return()=>supabase.removeChannel(channel);
  },[st.userId, st.battles.filter(b=>b.status==="active").length]);

  function handleTabChange(id){
    if(timerRunning&&id!=="timer") return;
    setTab(id);
  }
  function openNickEdit(){ setNickInput(st.nickname); setEditingNick(true); }
  function saveNick(){ if(nickInput.trim()){ setSt(p=>({...p,nickname:nickInput.trim()})); } setEditingNick(false); }

  // 닉네임 → 메인 (D: 슬라이드)
  function finishOnboarding(nick, userId){
    setSt(p=>({...p,nickname:nick,onboardingDone:true,userId:userId||p.userId}));
    setMainVis(true);
    setTimeout(()=>{
      setOnbVis(false);
    }, 30);
    setTimeout(()=>setScreen("main"), 900);
  }

  // 연속일수 → 메인 (D: 슬라이드)
  function finishGreet(){
    setSt(p=>({...p,lastGreetDate:today}));
    setMainVis(true);
    setTimeout(()=>setGreetVis(false), 30);
    setTimeout(()=>setScreen("main"), 900);
  }

  const DURATION="0.85s";
  const EASE="cubic-bezier(0.4, 0, 0.2, 1)";

  // 온보딩 레이어 스타일
  const onbLayerStyle={
    position:"fixed",inset:0,zIndex:20,
    transition:`opacity ${DURATION} ${EASE}, transform ${DURATION} ${EASE}`,
    opacity: onbVis?1:0,
    transform: onbVis?"translateX(0)":"translateX(-50%)",
    pointerEvents: onbVis?"auto":"none",
    visibility: onbVis?"visible":"hidden",
  };

  // 그리팅 레이어 스타일 (슬라이드)
  const greetLayerStyle={
    position:"fixed",inset:0,zIndex:20,
    transition:`opacity ${DURATION} ${EASE}, transform ${DURATION} ${EASE}`,
    opacity: greetVis?1:0,
    transform: greetVis?"translateX(0)":"translateX(-50%)",
    pointerEvents: greetVis?"auto":"none",
    visibility: greetVis?"visible":"hidden",
  };

  // 메인 레이어 스타일 (항상 오른쪽에서 슬라이드 인)
  const mainLayerStyle={
    position:"fixed",inset:0,zIndex:10,
    transition:`opacity ${DURATION} ${EASE}, transform ${DURATION} ${EASE}`,
    opacity: mainVis?1:0,
    transform: mainVis?"translateX(0)":"translateX(50%)",
    pointerEvents: screen==="main"?"auto":"none",
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#0d1f0d",overflow:"hidden"}}>

      {/* 인증 로딩 중 */}
      {authLoading&&(
        <div style={{position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",background:"#0d1f0d"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:16}}>⚾</div>
            <p style={{fontFamily:"'Oswald',sans-serif",fontSize:16,color:"rgba(255,255,255,0.5)",letterSpacing:3,margin:0}}>STUDY DUEL</p>
          </div>
        </div>
      )}

      {/* 메인 앱 */}
      <div style={mainLayerStyle}>
        <div style={{height:"100%",overflowY:"auto",display:"flex",justifyContent:"center",overscrollBehavior:"none",WebkitOverflowScrolling:"touch"}}>
          <div style={{width:"100%",maxWidth:430,position:"relative",minHeight:"100%"}}>
            <StadiumBg/>
            <div style={{position:"relative",zIndex:1,paddingTop:"max(env(safe-area-inset-top, 44px), 44px)",paddingBottom:70}}>
              <div style={{padding:"0 16px 8px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <p style={{fontFamily:"'Oswald',sans-serif",fontSize:20,color:"#fff",letterSpacing:3,margin:0}}>STUDY DUEL</p>
                <button onClick={openNickEdit} style={{background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:20,padding:"4px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                  <p style={{fontSize:12,color:"rgba(255,255,255,0.8)",margin:0,fontWeight:500}}>{st.nickname}</p>
                  <span style={{fontSize:9,color:"rgba(255,255,255,0.35)"}}>✏️</span>
                </button>
              </div>
              {tab==="main"&&<MainTab st={st} setSt={setSt} setTab={handleTabChange}/>}
              {tab==="battle"&&<BattleTab st={st} setSt={setSt} setTab={handleTabChange}/>}
              {tab==="timer"&&<TimerTab st={st} setSt={setSt} running={timerRunning} setRunning={setTimerRunning}/>}
              {tab==="calendar"&&<CalendarTab st={st} setSt={setSt}/>}
              {tab==="history"&&<HistoryTab st={st}/>}
            </div>
            <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"rgba(0,0,0,0.85)",borderTop:"1px solid rgba(255,255,255,0.08)",backdropFilter:"blur(10px)",display:"flex",zIndex:10,paddingBottom:"env(safe-area-inset-bottom)"}}>
              {TABS.map(t=>(
                <button key={t.id} onClick={()=>handleTabChange(t.id)} style={{flex:1,padding:"10px 0",background:"transparent",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:timerRunning&&t.id!=="timer"?"not-allowed":"pointer",opacity:timerRunning&&t.id!=="timer"?0.3:1}}>
                  <span style={{fontSize:16}}>{t.icon}</span>
                  <span style={{fontSize:9,color:tab===t.id?"#fff":"rgba(255,255,255,0.3)",letterSpacing:0.3}}>{t.label}</span>
                </button>
              ))}
            </div>
            {editingNick&&(
              <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 32px",background:"rgba(0,0,0,0.6)"}}>
                <div style={{width:"100%",maxWidth:320,background:"rgba(10,20,15,0.97)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:16,padding:"20px"}}>
                  <p style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:"rgba(255,255,255,0.7)",letterSpacing:2,margin:"0 0 14px",textAlign:"center"}}>닉네임 수정</p>
                  <input value={nickInput} onChange={e=>setNickInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveNick()} maxLength={15} autoFocus
                    style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:10,padding:"11px 14px",color:"#fff",fontSize:15,outline:"none",fontFamily:"inherit",boxSizing:"border-box",textAlign:"center",marginBottom:12}}/>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setEditingNick(false)} style={{flex:1,padding:"10px",background:"transparent",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,color:"rgba(255,255,255,0.5)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>취소</button>
                    <button onClick={saveNick} style={{flex:1,padding:"10px",background:nickInput.trim()?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:10,color:nickInput.trim()?"#fff":"rgba(255,255,255,0.3)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>저장</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 연속일수 레이어 */}
      <div style={greetLayerStyle}>
        <DailyGreet st={st} setSt={setSt} onDone={finishGreet}/>
      </div>

      {/* 온보딩 레이어 */}
      <div style={onbLayerStyle}>
        <Onboarding onDone={finishOnboarding}/>
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;700&display=swap');*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}body{margin:0;font-family:sans-serif;}input{color-scheme:dark;font-size:16px;}input::placeholder{color:rgba(255,255,255,0.25);}::-webkit-scrollbar{display:none;}input,textarea,select{font-size:16px !important;}
@keyframes countUp{from{opacity:0;transform:translateY(20px) scale(0.8);}to{opacity:1;transform:translateY(0) scale(1);}}
@keyframes flamePulse{0%,100%{transform:scale(1);}50%{transform:scale(1.15);}}
@keyframes timerPulse{0%{box-shadow:0 0 0 0 rgba(66,165,245,0.6);}70%{box-shadow:0 0 0 20px rgba(66,165,245,0);}100%{box-shadow:0 0 0 0 rgba(66,165,245,0);}}
@keyframes fillBar{from{width:0%;}to{width:var(--target-width);}}
@keyframes fadeSlideUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
@keyframes popIn{0%{opacity:0;transform:scale(0.7);}70%{transform:scale(1.08);}100%{opacity:1;transform:scale(1);}}`}</style>
    </div>
  );
}