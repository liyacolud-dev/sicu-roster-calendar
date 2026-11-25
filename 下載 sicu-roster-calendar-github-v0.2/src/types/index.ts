export type TextItem={text:string,x:number,y:number,width:number,page:number};
export type Entry={day:number,raw:string,main:string,note:string,enabled:boolean};
export type ShiftRule={code:string,label:string,start:string,end:string,crosses:boolean,allDay?:boolean,defaultEnabled:boolean};