import { it, expect } from 'vitest';
import { saleReviewErrors } from './branchSaleReview';
import { classifySaleCostEvidence } from '../../../shared/saleCostEvidence';
const valid = { branch:'tsumeb', customerType:'new', cart:[{qty:1}], name:'QA TEST CUSTOMER', paymentMethod:'cash', noReferral:true };
it('reviews complete walk-in details and reports all missing fields visibly', () => {
  expect(saleReviewErrors(valid)).toEqual({});
  expect(saleReviewErrors({...valid,noReferral:false})).toHaveProperty('referral');
  expect(Object.keys(saleReviewErrors({...valid,branch:'',name:' ',paymentMethod:''}))).toEqual(['branch','customer','payment']);
  expect(saleReviewErrors({...valid,customerType:'registered',selectedReg:null})).toHaveProperty('customer');
  expect(saleReviewErrors({...valid,customerType:'registered',selectedReg:{id:'member'}})).toEqual({});
  expect(saleReviewErrors({...valid,customerType:'prescription',noReferral:false})).toEqual({});
});
it('does not label unapproved zero or catalogue estimates as original received evidence', () => {
  expect(classifySaleCostEvidence({originalReceivedDPC:0,originalReceivedCost:0})).toBe('missing');
  expect(classifySaleCostEvidence({originalReceivedDPC:0,originalReceivedCost:0,zeroCostApproved:true})).toBe('original');
  expect(classifySaleCostEvidence({originalReceivedDPC:7,originalReceivedCost:null})).toBe('partial');
  expect(classifySaleCostEvidence({originalReceivedDPC:7,originalReceivedCost:2})).toBe('original');
  expect(classifySaleCostEvidence({estimated:true})).toBe('estimated');
  expect(classifySaleCostEvidence({originalReceivedDPC:NaN,originalReceivedCost:-2})).toBe('missing');
});
