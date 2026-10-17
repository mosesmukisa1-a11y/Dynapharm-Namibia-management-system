// Finite application CRUD identifiers, from repository-only owned bootstrap.
// This is an SQL structure policy, not authority to change a database schema.
import {types as nativeTypes} from 'node:util';
const definitions={
  products:'branch bv category cp created_at created_by description dp id images is_active name sku tax_rate unit updated_at',
  product_images:'created_at display_order file_size filename height id image_data image_type image_url is_primary mime_type product_id product_name thumbnail_url updated_at uploaded_at variant_data width',
  employees:'address branch branches created_at data department dob email emergency_contact_name emergency_contact_phone employee_id employment_status employment_type full_name hire_date id leave_entitlements notes phone position role salary supervisor_id updated_at user_id',
  clients:'address branch city created_at data date_of_birth email full_name gender id phone reference_number updated_at',
  reports:'branch client_id consultant created_at data id report_type updated_at',
  appointments:'branch client_reference created_at data date email full_name id notes phone status time type updated_at',
  online_orders:'branch_id created_at customer_email customer_name customer_phone customer_type delivery_address delivery_fee delivery_fee_percentage delivery_method distance_km fulfilled_at id items notes order_number payment_method payment_status status stock_deducted subtotal total_amount town_id updated_at',
  client_history_events:'action actor created_at encounter_id id snapshot',
  client_encounters:'branch captured_at captured_by client_id data id report_id responsible_consultant reviewed_at reviewed_by service_at source status version',
  client_history_operations:'actor created_at id request response',
  client_history_attachments:'captured_at captured_by client_id id mime_type name object_name size',
  notifications:'created_at id is_read message metadata recipient_id recipient_type reference_id title type',
  stock_requests:'approved_at approved_by created_at created_by data dispatch_warehouse dispatched_at dispatched_by history id items last_status_change notes priority rejected_at rejected_by rejection_reason request_number request_type requesting_branch reviewed_at reviewed_by status updated_at updated_by',
  distributors:'agreement_data branch commission_rate created_at date_joined distributor_code distributor_name email entity_type id level location metadata mobile_no photo_filename photo_updated_at photo_url position position_code sex sponsor_code status updated_at version',
  file_uploads:'category description entity_id entity_name file_size file_url filename id media_type metadata mime_type upload_type uploaded_at uploaded_by',
  stock_transfers:'amended_at amended_by_gm branch_receipt_note created_at created_by delivered_at delivered_by destination_branch_staff discrepancy_flag discrepancy_note dispatch_notes dispatch_reference dispatched_at dispatched_by from_warehouse gm_action gm_approved_at gm_approved_by gm_approved_by_id gm_comment id metadata prepared_by_id prepared_by_role priority product_name quantity receipt_status received_at received_by rejected_at rejected_by rejection_reason request_id request_number signature_name status to_branch updated_at',
  towns:'created_at id latitude longitude name region updated_at',
  warehouse_locations:'branch_id code contact created_at id metadata name status timezone type updated_at',
  users:'additional_roles address bank_account_no bank_name branch branches created_at date_of_birth email emergency_contact_name emergency_contact_phone field_of_study full_name gender graduation_year highest_qualification home_language id institution_name is_active last_login marital_status metadata must_change_password national_id nationality next_of_kin_name next_of_kin_phone next_of_kin_relationship password_hash phone professional_certifications role updated_at username',
  client_dispense_evidence:'captured_at captured_by data encounter_id id items mode report_id service_at source_reference',
  field_stock:'balance batch_no created_at created_by expiry_date id issue_date metadata notes officer_name origin_location origin_type product_id product_name quantity_issued quantity_returned quantity_sold quantity_used return_date status team_name updated_at',
  stock_adjustments:'adj_number approved_at approved_by approved_by_name created_at field_to_adjust gm_notes id location new_value old_value product_name reason requested_by requested_by_name status target_id target_type updated_at',
  branch_walkin_sales:'id branch_id sale_number sale_date customer_name customer_phone customer_email customer_type payment_method subtotal discount tax total total_bv status items data referral_nb distributor_nb metadata created_by created_at updated_at offline_id',
};
export const applicationFields=Object.freeze(Object.fromEntries(Object.entries(definitions)
  .map(([table,columns])=>[table,Object.freeze(columns.split(' '))])));
export function applicationTable(table){
  if(typeof table!=='string'||!Object.hasOwn(applicationFields,table))throw Error('Invalid SQL table');
  return table;
}
export function fieldSnapshot(data,fields){
  if(!data||typeof data!=='object'||nativeTypes.isProxy(data)||Object.getOwnPropertySymbols(data).length||Array.isArray(data)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(data)))throw Error('Invalid update fields');
  const descriptors=Object.getOwnPropertyDescriptors(data),keys=Object.keys(descriptors);
  if(keys.some(k=>!fields.includes(k)||!Object.hasOwn(descriptors[k],'value')))throw Error('Invalid update fields');
  return Object.freeze(Object.fromEntries(keys.map(k=>[k,descriptors[k].value])));
}
export function finiteFields(data,fields){
  return Object.keys(fieldSnapshot(data,fields));
}
export function applicationRecord(table,data){
  return fieldSnapshot(data,applicationFields[applicationTable(table)]);
}
export function applicationColumns(table,data){
  return finiteFields(data,applicationFields[applicationTable(table)]);
}
