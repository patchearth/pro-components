import type { ReactNode } from 'react';
import { useMemo } from 'react';
import React, {
  useState,
  useImperativeHandle,
  useRef,
  useContext,
  useCallback,
  useEffect,
} from 'react';
import type { SelectProps } from 'antd';
import { Space, Spin, ConfigProvider } from 'antd';
import type {
  ProFieldRequestData,
  ProFieldValueEnumType,
  ProSchemaValueEnumMap,
  ProSchemaValueEnumObj,
  RequestOptionsType,
} from '@ant-design/pro-utils';

import {
  nanoid,
  useDeepCompareEffect,
  useMountMergeState,
  useDebounceValue,
} from '@ant-design/pro-utils';

import { useIntl } from '@ant-design/pro-provider';

import LightSelect from './LightSelect';
import SearchSelect from './SearchSelect';
import type { ProFieldStatusType } from '../Status';
import TableStatus, { ProFieldBadgeColor } from '../Status';
import type { ProFieldFC } from '../../index';
import './index.less';
import useSWR from 'swr';

type SelectOptionType = Partial<RequestOptionsType>[];

export type FieldSelectProps<FieldProps = any> = {
  text: string;
  /** 值的枚举，如果存在枚举，Search 中会生成 select */
  valueEnum?: ProFieldValueEnumType;
  /** 防抖动时间 默认10 单位ms */
  debounceTime?: number;
  /** 从服务器读取选项 */
  request?: ProFieldRequestData;
  /** 重新触发的时机 */
  params?: any;

  /** 组件的全局设置 */
  fieldProps?: FieldProps;

  bordered?: boolean;
  id?: string;

  children?: ReactNode;
};

export const ObjToMap = (value: ProFieldValueEnumType | undefined): ProSchemaValueEnumMap => {
  if (getType(value) === 'map') {
    return value as ProSchemaValueEnumMap;
  }
  return new Map(Object.entries(value || {}));
};

/**
 * 转化 text 和 valueEnum 通过 type 来添加 Status
 *
 * @param text
 * @param valueEnum
 * @param pure 纯净模式，不增加 status
 */
export const proFieldParsingText = (
  text: string | number | (string | number)[],
  valueEnumParams: ProFieldValueEnumType,
): React.ReactNode => {
  if (Array.isArray(text)) {
    return (
      <Space>
        {text.map((value) => (
          // @ts-ignore
          <React.Fragment key={value?.value || value}>
            {proFieldParsingText(value, valueEnumParams)}
          </React.Fragment>
        ))}
      </Space>
    );
  }

  const valueEnum = ObjToMap(valueEnumParams);

  if (!valueEnum.has(text) && !valueEnum.has(`${text}`)) {
    // @ts-ignore
    return text?.label || text;
  }

  const domText = (valueEnum.get(text) || valueEnum.get(`${text}`)) as {
    text: ReactNode;
    status: ProFieldStatusType;
    color?: string;
  };

  if (!domText) {
    // @ts-ignore
    return text?.label || text;
  }

  const { status, color } = domText;

  const Status = TableStatus[status || 'Init'];
  // 如果类型存在优先使用类型
  if (Status) {
    return <Status>{domText.text}</Status>;
  }

  // 如果不存在使用颜色
  if (color) {
    return <ProFieldBadgeColor color={color}>{domText.text}</ProFieldBadgeColor>;
  }
  // 什么都没有使用 text
  return domText.text || (domText as any as React.ReactNode);
};

const Highlight: React.FC<{
  label: string;
  words: string[];
}> = ({ label, words }) => {
  const { getPrefixCls } = useContext(ConfigProvider.ConfigContext);
  const lightCls = getPrefixCls('pro-select-item-option-content-light');
  const optionCls = getPrefixCls('pro-select-item-option-content');
  const matchKeywordsRE = new RegExp(
    words.map((word) => word.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')).join('|'),
    'gi',
  );

  let matchText = label;

  const elements: React.ReactNode[] = [];

  while (matchText.length) {
    const match = matchKeywordsRE.exec(matchText);
    if (!match) {
      elements.push(matchText);
      break;
    }

    const start = match.index;
    const matchLength = match[0].length + start;

    elements.push(
      matchText.slice(0, start),
      React.createElement(
        'span',
        {
          className: lightCls,
        },
        matchText.slice(start, matchLength),
      ),
    );
    matchText = matchText.slice(matchLength);
  }

  return React.createElement(
    'div',
    {
      className: optionCls,
    },
    ...elements,
  );
};

/**
 * 获取类型的 type
 *
 * @param obj
 */
function getType(obj: any) {
  // @ts-ignore
  const type = Object.prototype.toString
    .call(obj)
    .match(/^\[object (.*)\]$/)[1]
    .toLowerCase();
  if (type === 'string' && typeof obj === 'object') return 'object'; // Let "new String('')" return 'object'
  if (obj === null) return 'null'; // PhantomJS has type "DOMWindow" for null
  if (obj === undefined) return 'undefined'; // PhantomJS has type "DOMWindow" for undefined
  return type;
}

/**
 * 递归筛选 item
 *
 * @param item
 * @param keyWords
 * @returns
 */
function filerByItem(
  item: {
    label: string;
    value: string;
    optionType: string;
    children: any[];
    options: any[];
  },
  keyWords?: string,
) {
  if (!keyWords) return true;
  if (
    item?.label?.toString().toLowerCase().includes(keyWords.toLowerCase()) ||
    item?.value?.toString().toLowerCase().includes(keyWords.toLowerCase())
  ) {
    return true;
  }
  if (item.optionType === 'optGroup' && (item.children || item.options)) {
    const findItem = [...(item.children || []), item.options || []].find((mapItem) => {
      return filerByItem(mapItem, keyWords);
    });
    if (findItem) return true;
  }
  return false;
}

/**
 * 把 value 的枚举转化为数组
 *
 * @param valueEnum
 */
export const proFieldParsingValueEnumToArray = (
  valueEnumParams: ProFieldValueEnumType,
): SelectOptionType => {
  const enumArray: Partial<
    RequestOptionsType & {
      text: string;
      /** 是否禁用 */
      disabled?: boolean;
    }
  >[] = [];
  const valueEnum = ObjToMap(valueEnumParams);

  valueEnum.forEach((_, key) => {
    const value = (valueEnum.get(key) || valueEnum.get(`${key}`)) as {
      text: string;
      disabled?: boolean;
    };

    if (!value) {
      return;
    }

    if (typeof value === 'object' && value?.text) {
      enumArray.push({
        text: value?.text as unknown as string,
        value: key,
        label: value?.text as unknown as string,
        disabled: value.disabled,
      });
      return;
    }
    enumArray.push({
      text: value as unknown as string,
      value: key,
    });
  });
  return enumArray;
};

export const useFieldFetchData = (
  props: FieldSelectProps & {
    proFieldKey?: React.Key;
    defaultKeyWords?: string;
    cacheForSwr?: boolean;
  },
): [boolean, SelectOptionType, (keyWord?: string) => void, () => void] => {
  const { cacheForSwr } = props;

  const [keyWords, setKeyWords] = useState<string | undefined>(props.defaultKeyWords);
  /** Key 是用来缓存请求的，如果不在是有问题 */
  const [cacheKey] = useState(() => {
    if (props.proFieldKey) {
      return props.proFieldKey.toString();
    }
    if (props.request) {
      return nanoid();
    }
    return 'no-fetch';
  });

  const proFieldKeyRef = useRef(cacheKey);

  const getOptionsFormValueEnum = useCallback((coverValueEnum: ProFieldValueEnumType) => {
    return proFieldParsingValueEnumToArray(ObjToMap(coverValueEnum)).map(
      ({ value, text, ...rest }) => ({
        label: text,
        value,
        key: value,
        ...rest,
      }),
    );
  }, []);

  const [options, setOptions] = useMountMergeState<SelectOptionType>(
    () => {
      if (props.valueEnum) {
        return getOptionsFormValueEnum(props.valueEnum);
      }
      return [];
    },
    {
      value: props.fieldProps?.options,
    },
  );

  useDeepCompareEffect(() => {
    // 优先使用 fieldProps?.options
    if (!props.valueEnum || props.fieldProps?.options) return;
    setOptions(getOptionsFormValueEnum(props.valueEnum));
  }, [props.valueEnum]);

  const swrKey = useDebounceValue(
    [proFieldKeyRef.current, props.params, keyWords] as const,
    props.debounceTime ?? props?.fieldProps?.debounceTime ?? 0,
    [props.params, keyWords],
  );

  const {
    data,
    mutate: setLocaleData,
    isValidating,
  } = useSWR(
    () => {
      if (!props.request) {
        return null;
      }

      return swrKey;
    },
    (_, params, kw) =>
      props.request!(
        {
          ...params,
          keyWords: kw,
        },
        props,
      ),
    {
      revalidateIfStale: !cacheForSwr,
      // 打开 cacheForSwr 的时候才应该支持两个功能
      revalidateOnReconnect: cacheForSwr,
      shouldRetryOnError: false,
      // @todo 这个功能感觉应该搞个API出来
      revalidateOnFocus: false,
    },
  );

  const resOptions = useMemo(() => {
    const opt = options?.map((item) => {
      if (typeof item === 'string') {
        return {
          label: item,
          value: item,
        };
      }
      if (item?.optionType === 'optGroup' && (item.children || item.options)) {
        const childrenOptions = [...(item.children || []), ...(item.options || [])].filter(
          (mapItem) => {
            return filerByItem(mapItem, keyWords);
          },
        );
        return {
          ...item,
          children: childrenOptions,
          options: childrenOptions,
        };
      }
      return item;
    });

    // filterOption 为 true 时 filter数据, filterOption 默认为true
    if (props.fieldProps?.filterOption === true || props.fieldProps?.filterOption === undefined) {
      return opt?.filter((item) => {
        if (!item) return false;
        if (!keyWords) return true;
        return filerByItem(item as any, keyWords);
      });
    }

    return opt;
  }, [options, keyWords, props.fieldProps?.filterOption]);

  return [
    isValidating,
    props.request ? (data as SelectOptionType) : resOptions,
    (fetchKeyWords?: string) => {
      setKeyWords(fetchKeyWords);
    },
    () => {
      setKeyWords(undefined);
      setLocaleData([], false);
    },
  ];
};

/**
 * 可以根据 valueEnum 来进行类型的设置
 *
 * @param
 */
const FieldSelect: ProFieldFC<
  FieldSelectProps & Pick<SelectProps, 'fieldNames' | 'style' | 'className'>
> = (props, ref) => {
  const {
    mode,
    valueEnum,
    render,
    renderFormItem,
    request,
    fieldProps,
    plain,
    children,
    light,
    proFieldKey,
    params,
    label,
    bordered,
    id,
    ...rest
  } = props;

  const inputRef = useRef();
  const intl = useIntl();
  const keyWordsRef = useRef<string>('');
  const { fieldNames } = fieldProps;

  useEffect(() => {
    keyWordsRef.current = fieldProps?.searchValue;
  }, [fieldProps?.searchValue]);

  const [loading, options, fetchData, resetData] = useFieldFetchData(props);
  const size = useContext(ConfigProvider.SizeContext);
  useImperativeHandle(ref, () => ({
    ...(inputRef.current || {}),
    fetchData: () => fetchData(),
  }));

  const optionsValueEnum = useMemo(() => {
    if (mode !== 'read') return;

    const {
      label: labelPropsName = 'label',
      value: valuePropsName = 'value',
      options: optionsPropsName = 'options',
    } = fieldNames || {};

    const valuesMap = new Map();

    const traverseOptions = (_options: typeof options) => {
      if (!_options?.length) {
        return valuesMap;
      }
      const length = _options.length;
      let i = 0;
      while (i < length) {
        const cur = _options[i++];
        valuesMap.set(cur[valuePropsName], cur[labelPropsName]);
        traverseOptions(cur[optionsPropsName]);
      }
      return valuesMap;
    };

    return traverseOptions(options);
  }, [fieldNames, mode, options]);

  if (mode === 'read') {
    const dom = (
      <>
        {proFieldParsingText(
          rest.text,
          ObjToMap(valueEnum || optionsValueEnum) as unknown as ProSchemaValueEnumObj,
        )}
      </>
    );

    if (render) {
      return render(rest.text, { mode, ...fieldProps }, dom) || null;
    }
    return dom;
  }

  if (mode === 'edit' || mode === 'update') {
    const renderDom = () => {
      if (light) {
        return (
          <LightSelect
            bordered={bordered}
            id={id}
            loading={loading}
            ref={inputRef}
            allowClear
            size={size}
            options={options}
            label={label}
            placeholder={intl.getMessage('tableForm.selectPlaceholder', '请选择')}
            {...fieldProps}
          />
        );
      }
      return (
        <SearchSelect
          key="SearchSelect"
          className={rest.className}
          style={{
            minWidth: 100,
            ...rest.style,
          }}
          bordered={bordered}
          id={id}
          loading={loading}
          ref={inputRef}
          allowClear
          notFoundContent={loading ? <Spin size="small" /> : fieldProps?.notFoundContent}
          fetchData={(keyWord) => {
            keyWordsRef.current = keyWord;
            fetchData(keyWord);
          }}
          resetData={resetData}
          optionItemRender={(item) => {
            if (typeof item.label === 'string' && keyWordsRef.current) {
              return <Highlight label={item.label} words={[keyWordsRef.current]} />;
            }
            return item.label;
          }}
          placeholder={intl.getMessage('tableForm.selectPlaceholder', '请选择')}
          label={label}
          {...fieldProps}
          options={options}
        />
      );
    };
    const dom = renderDom();
    if (renderFormItem) {
      return renderFormItem(rest.text, { mode, ...fieldProps, options }, dom) || null;
    }
    return dom;
  }
  return null;
};

export default React.forwardRef(FieldSelect);
