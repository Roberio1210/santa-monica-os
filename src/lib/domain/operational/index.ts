export type { OperationalCustomer, OperationalEmployee, OperationalOrder, OperationalOrderSource, OperationalOrderStatus, OperationalPaymentStatus, OperationalServiceCategory, OperationalVehicle } from "@/lib/domain/operational/types";
export { classifyServiceCategory } from "@/lib/domain/operational/category";
export { mapJumpParkOrderToCustomer, mapJumpParkOrderToEmployee, mapJumpParkOrderToOperationalOrder, mapJumpParkOrderToVehicle, type JumpParkOrderInput } from "@/lib/domain/operational/mappers/fromJumpPark";
