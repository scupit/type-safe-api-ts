import { getEnumKey, getEnumValue } from "./EnumHelper.ts";
import { EnumKeyTypes, EnumValueTypes } from "./EnumTyping.ts";
import { HttpStatus } from "./HttpStatus.ts";

export class BasicResponse {
  constructor(
    public status: number,
    public body: any
  ) { }
}

export const EMPTY_BODY = "";

// Union of HttpStatus enum keys, restricted to strings only
type StatusKeyType = EnumKeyTypes<typeof HttpStatus>

// Represents the types a piece of API response data may take throughout its lifetime.
// This is useful because it allows us to describe both the converted and initial results
// of an API call, allowing for a smooth transition from raw data into a full-fledged
// usable type.
//
// Specifying all these types at once provides the ability to auto generate conversion
// functions and type-safe data handlers per response status.
type ApiDataStates<InType, UseType> = [InType, UseType];

// This allows other keys, need 
type ApiStatusMap = {
  [_: number]: never;
} & {
  // ApiDataStates is used here to infer the type This essentially allows each property value
  // to be a type safe generic.
  [key in StatusKeyType]?: any extends ApiDataStates<infer InType, infer UseType>
    ? ApiDataStates<InType, UseType>
    : never
};

// Only take used keys from ApiStatusMap. Marks all the used keys as required while still preserving their
// types. Since these maps are defined as literals, this also ensures that extra unused items are not defined in
// types derived from the map.
type FinalApiStatusMap<T extends ApiStatusMap> = {
  [_: number]: never
} & Required<Omit<T, Exclude<keyof T, StatusKeyType>>>

type InTypes<T extends ApiStatusMap> = {
  [key in keyof FinalApiStatusMap<T>]: FinalApiStatusMap<T>[key] extends ApiDataStates<infer InType, infer UseType>
    ? InType
    : never
}

type UseTypes<T extends ApiStatusMap> = {
  [key in keyof FinalApiStatusMap<T>]: FinalApiStatusMap<T>[key] extends ApiDataStates<infer InType, infer UseType>
    ? UseType
    : never
}

type ResponseConversionHandlerMap<
  T extends ApiStatusMap,
  BodyTypeMap extends FinalApiStatusMap<T> = FinalApiStatusMap<T>
> = {
  [key in keyof BodyTypeMap]: BodyTypeMap[key] extends ApiDataStates<infer InType, infer UseType>
    // This is the type conversion function
    ? (body: InType) => UseType
    : never;
};

type BodyHandlerFunctionMap<
  T extends ApiStatusMap,
  ReturnType,
  BodyTypeMap extends FinalApiStatusMap<T> = FinalApiStatusMap<T>,
> = {
  [key in keyof BodyTypeMap]: BodyTypeMap[key] extends ApiDataStates<infer _, infer UseType>
    ? (body: UseType) => ReturnType
    : never;
};

type InferredHandlerReturnTypeMap<
  StatusMap extends ApiStatusMap,
  HandlerMap extends BodyHandlerFunctionMap<StatusMap, unknown>,
  ReturnType
> = {
  [key in keyof HandlerMap]: HandlerMap[key] extends ((body: infer T) => infer R)
    ? ReturnType extends unknown
      ? R
      : ReturnType
    : never
};

type InferredHandlerReturnTypeUnion<
  StatusMap extends ApiStatusMap,
  HandlerMap extends BodyHandlerFunctionMap<StatusMap, unknown>,
  ReturnType
> = InferredHandlerReturnTypeMap<StatusMap, HandlerMap, ReturnType>[keyof InferredHandlerReturnTypeMap<StatusMap, HandlerMap, ReturnType>];

export class ComplexApiResponse<
  BodyTypeMapIn extends ApiStatusMap
> {
  private _body: UseTypes<BodyTypeMapIn>;
  public readonly status: HttpStatus;

  constructor(
    public readonly responseObject: BasicResponse,
    // body: InTypes<BodyTypeMapIn>[keyof InTypes<BodyTypeMapIn>],
    conversionHandlerMap: ResponseConversionHandlerMap<BodyTypeMapIn>
  ) {
    // Ensure the enum key
    const statusName: EnumKeyTypes<typeof HttpStatus> = getEnumKey(HttpStatus, responseObject.status);
    this.status = HttpStatus[statusName];

    const typedBody = responseObject.body as InTypes<BodyTypeMapIn>[keyof InTypes<BodyTypeMapIn>];

    if (statusName in conversionHandlerMap) {
      this._body = conversionHandlerMap[statusName as keyof ResponseConversionHandlerMap<BodyTypeMapIn>](typedBody) as UseTypes<BodyTypeMapIn>;
    }
    else {
      throw TypeError(`Unhandled HTTP response with status ${statusName} (${this.status}) when constructing the complex response.`)
    }
  }

  matchStatus<
    ReturnType,
    HandlerMap extends BodyHandlerFunctionMap<BodyTypeMapIn, ReturnType>,
  >(
    bodyHandlerMap: HandlerMap
  ): InferredHandlerReturnTypeUnion<BodyTypeMapIn, HandlerMap, ReturnType> {
    const statusName: EnumKeyTypes<typeof HttpStatus> = getEnumKey(HttpStatus, this.status);

    if (statusName in bodyHandlerMap) {
      return bodyHandlerMap[statusName as keyof HandlerMap](this._body) as InferredHandlerReturnTypeUnion<BodyTypeMapIn, HandlerMap, ReturnType>;
    }
    else {
      // This shouldn't ever be able to happen. The TypeScript Compiler ensures that every status defined in
      // BodyTypeMapIn (the ApiStatusMap put into this class) will also have a handler when the handler map
      // is written as an object literal. And it's a pain to do without a literal. Any unexpected status codes
      // not shown in the type system are guaranteed to not exist in the handler map on in the constructor
      // type conversion map. Therefore any statuses not shown to the type checker but received at runtime will
      // result in an error being thrown in the constructor.
      throw (TypeError(`Unable to handle body because a handler function for status ${statusName} (${this.status}) is not defined.`))
    }
  }
}