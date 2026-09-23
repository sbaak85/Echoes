import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useResponsiveConfirmation} from '../../app/responsive-confirmation';
import '../../app/globals.css';
function Preview(){
 const [kind,setKind]=useState('submission'),[message,setMessage]=useState('尚未確認');
 const ref=useResponsiveConfirmation();const submission=kind==='submission';
 const card=(name:string,file:string,source=false)=><div className={`item-change-visual-card ${submission?'':'has-outside-quantity'}`} key={name}><span className="item-change-visual-icon"><img src={'/ui/'+file} alt={name}/>{submission&&source&&<b className="item-change-visual-quantity">×1</b>}</span>{!submission&&<b className="item-change-visual-quantity is-outside">×1</b>}<small>{name}</small></div>;
 return <><style>{`body{margin:0;background:#071317}.test-controls{position:fixed;top:0;left:0;z-index:9999;color:white}.test-controls button{outline:none}`}</style><nav className="test-controls"><button onClick={()=>setKind('submission')}>投入面板</button><button onClick={()=>setKind('use')}>使用物品</button><output>{message}</output></nav><div className={submission?'camp-power-confirmation-overlay':'scene-connection-confirmation-overlay item-use-confirmation-overlay'}>
 <section ref={ref} className={submission?'camp-power-confirmation quest-item-submission-confirmation':'scene-connection-confirmation item-use-confirmation'}>
 <small>{submission?'COMMUNICATION ARRAY ASSEMBLY':'ITEM USE CONFIRMATION'}</small>
 <h3>{submission?'安裝通訊陣列面板？':<>確認打開「多功能工具箱」，以取得<span>「銲槍工具」×1嗎？</span></>}</h3>
 {submission&&<p>是否消耗「通訊陣列面板」×1，安裝至通訊陣列？</p>}
 <div className={'item-change-visualization '+(submission?'quest-item-submission-visualization':'item-use-change-visualization')}><div className="item-change-visual-group is-source">{submission?[['通訊陣列面板','communication-array-panel'],['量子傳輸器','quantum-transmitter'],['校正元件','calibration-component']].map(([n,f])=>card(n,`items/${f}-icon-280.png`,true)):card('多功能工具箱','items/repair-kit-icon-280.png',true)}</div><span className="item-change-visual-arrow"><i/></span><div className="item-change-visual-group is-target">{submission?card('通訊陣列','interactions/communication-array-tower-icon.png'):card('銲槍工具','items/welding-tool-icon-280.png')}</div></div>
 <p className="camp-power-confirmation-owned">{submission?'目前持有：通訊陣列面板 ×1 ／ 量子傳輸器 ×1 ／ 校正元件 ×1':'打開「多功能工具箱」後將會消耗該物件。'}</p>
 <div className={submission?'camp-power-confirmation-actions':'scene-connection-confirmation-actions item-use-confirmation-actions'}><button onClick={()=>setMessage('已取消')}>取消</button><button className="is-confirm" onClick={()=>setMessage('已確認')}>確認投入</button></div><footer>方向鍵：選擇　Enter：確認　Esc：取消</footer></section></div></>;
}createRoot(document.getElementById('root')!).render(<Preview/>);
