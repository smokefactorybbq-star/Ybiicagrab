export const BASE_DAY_PRICE=350;
export function priceForDay(date:string,discounts:Record<string,number>={}){
 const percent=[20,30,50].includes(discounts[date])?discounts[date]:0;
 return {date,percent,price:BASE_DAY_PRICE*(100-percent)/100};
}
export function priceForDates(dates:string[],discounts:Record<string,number>={}){
 const days=dates.map(date=>priceForDay(date,discounts));
 return {rate:dates.length?BASE_DAY_PRICE:0,total:days.reduce((sum,d)=>sum+d.price,0),days};
}
