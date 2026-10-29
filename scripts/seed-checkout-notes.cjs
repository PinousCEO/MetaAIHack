const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../samples/Checkout');
const definitions=[
 ['CheckoutController.cs','ApplyCoupon','Coordinate coupon validation, pricing, state and displayed totals.','Create one entry point for the selected coupon action while keeping reusable rules separate.','The entry point calls independent validator, shared pricing and state/view implementations. This lets a person or agent follow the source relationships from the selected button.'],
 ['CouponRules.cs','CalculateTotal','Calculate a discounted subtotal from the shared coupon percentage.','Share the pricing behavior between checkout and cart summary.','Both CheckoutController.ApplyCoupon and CartSummary.Estimate call this one implementation. Percentage changes therefore have one source of truth.'],
 ['CouponRules.cs','IsValid','Check whether a coupon is eligible.','Keep eligibility separate from pricing.','The caller checks eligibility before updating cart state. The arithmetic preview does not execute this validation branch.'],
 ['CartState.cs','CartState','Store cart amounts shared by checkout and the totals view.','Keep cart state independent of display and pricing calculation.','The controller updates Total through SetTotal and the view reads the same instance.'],
 ['CheckoutController.cs','TotalsView','Read the cart total for presentation.','Keep result display independent of pricing.','TotalsView reads CartState.Total instead of duplicating the discount formula.']
];
const notes=definitions.map(([file,entity,purpose,creationReason,rationale])=>({path:file,entity,expectedHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file),'utf8')).digest('hex'),purpose,creationReason,rationale,author:'Codex / initial implementation'}));
fs.writeFileSync(path.join(root,'depth.notes.json'),JSON.stringify(notes,null,2)+'\n','utf8');console.log('Recorded '+notes.length+' source-hashed design notes for the actual example implementation.');
