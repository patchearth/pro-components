import './index.less';
import Icon, { createFromIconfontCN } from '@ant-design/icons';
import { Menu, Skeleton } from 'antd';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import classNames from 'classnames';
import { isUrl, isImg, useMountMergeState } from '@ant-design/pro-utils';

import type { MenuTheme, MenuProps } from 'antd';
import type { PureSettings } from '../../defaultSettings';
import defaultSettings from '../../defaultSettings';
import { getOpenKeysFromMenuData } from '../../utils/utils';

import type { MenuDataItem, MessageDescriptor, Route, RouterTypes, WithFalse } from '../../typings';
import MenuCounter from './Counter';
import type { PrivateSiderMenuProps } from './SiderMenu';
import type { ItemType } from 'antd/lib/menu/hooks/useItems';

// todo
export type MenuMode = 'vertical' | 'vertical-left' | 'vertical-right' | 'horizontal' | 'inline';

export type BaseMenuProps = {
  className?: string;
  /** 默认的是否展开，会受到 breakpoint 的影响 */
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  splitMenus?: boolean;
  isMobile?: boolean;
  menuData?: MenuDataItem[];
  mode?: MenuMode;
  onCollapse?: (collapsed: boolean) => void;
  openKeys?: WithFalse<string[]> | undefined;
  handleOpenChange?: (openKeys: string[]) => void;
  iconPrefixes?: string;
  /** 要给菜单的props, 参考antd-menu的属性。https://ant.design/components/menu-cn/ */
  menuProps?: MenuProps;
  style?: React.CSSProperties;
  theme?: MenuTheme;
  formatMessage?: (message: MessageDescriptor) => string;

  /**
   * @name 处理父级菜单的 props，可以复写菜单的点击功能，一般用于埋点
   * @see 子级的菜单要使用 menuItemRender 来处理
   *
   * @example 使用 a 标签跳转到特殊的地址 subMenuItemRender={(item, defaultDom) => { return <a onClick={()=> history.push(item.path) }>{defaultDom}</a> }}
   * @example 增加埋点 subMenuItemRender={(item, defaultDom) => { return <a onClick={()=> log.click(item.name) }>{defaultDom}</a> }}
   */
  subMenuItemRender?: WithFalse<
    (
      item: MenuDataItem & {
        isUrl: boolean;
      },
      defaultDom: React.ReactNode,
    ) => React.ReactNode
  >;

  /**
   * @name 处理菜单的 props，可以复写菜单的点击功能，一般结合 Router 框架使用
   * @see 非子级的菜单要使用 subMenuItemRender 来处理
   *
   * @example 使用 a 标签 menuItemRender={(item, defaultDom) => { return <a onClick={()=> history.push(item.path) }>{defaultDom}</a> }}
   * @example 使用 Link 标签 menuItemRender={(item, defaultDom) => { return <Link to={item.path}>{defaultDom}</Link> }}
   */
  menuItemRender?: WithFalse<
    (
      item: MenuDataItem & {
        isUrl: boolean;
        onClick: () => void;
      },
      defaultDom: React.ReactNode,
      menuProps: BaseMenuProps,
    ) => React.ReactNode
  >;

  /**
   * @name 处理 menuData 的方法，与 menuDataRender 不同，postMenuData处理完成后会直接渲染，不再进行国际化和拼接处理
   *
   * @example 增加菜单图标 postMenuData={(menuData) => { return menuData.map(item => { return { ...item, icon: <Icon type={item.icon} /> } }) }}
   */
  postMenuData?: (menusData?: MenuDataItem[]) => MenuDataItem[];
} & Partial<RouterTypes<Route>> &
  Omit<MenuProps, 'openKeys' | 'onOpenChange' | 'title'> &
  Partial<PureSettings>;

let IconFont = createFromIconfontCN({
  scriptUrl: defaultSettings.iconfontUrl,
});

// Allow menu.js config icon as string or ReactNode
//   icon: 'setting',
//   icon: 'icon-geren' #For Iconfont ,
//   icon: 'http://demo.com/icon.png',
//   icon: '/favicon.png',
//   icon: <Icon type="setting" />,
const getIcon = (
  icon?: string | React.ReactNode,
  iconPrefixes: string = 'icon-',
): React.ReactNode => {
  if (typeof icon === 'string' && icon !== '') {
    if (isUrl(icon) || isImg(icon)) {
      return (
        <Icon component={() => <img src={icon} alt="icon" className="ant-pro-sider-menu-icon" />} />
      );
    }
    if (icon.startsWith(iconPrefixes)) {
      return <IconFont type={icon} />;
    }
  }
  return icon;
};

class MenuUtil {
  constructor(props: BaseMenuProps) {
    this.props = props;
  }

  props: BaseMenuProps;

  getNavMenuItems = (menusData: MenuDataItem[] = [], isChildren: boolean): ItemType[] =>
    menusData.map((item) => this.getSubMenuOrItem(item, isChildren)).filter((item) => item);

  /** Get SubMenu or Item */
  getSubMenuOrItem = (item: MenuDataItem, isChildren: boolean): ItemType => {
    const children = item?.children || item?.routes;
    if (Array.isArray(children) && children.length > 0) {
      const name = this.getIntlName(item);
      const { subMenuItemRender, prefixCls, menu, iconPrefixes } = this.props;
      //  get defaultTitle by menuItemRender
      const defaultTitle = item.icon ? (
        <span className={`${prefixCls}-menu-item`} title={name}>
          {!isChildren && getIcon(item.icon, iconPrefixes)}
          <span className={`${prefixCls}-menu-item-title`}>{name}</span>
        </span>
      ) : (
        <span className={`${prefixCls}-menu-item`} title={name}>
          {name}
        </span>
      );

      // subMenu only title render
      const title = subMenuItemRender
        ? subMenuItemRender({ ...item, isUrl: false }, defaultTitle)
        : defaultTitle;

      return {
        type: menu?.type === 'group' ? ('group' as const) : (undefined as any),
        label: title,
        children: this.getNavMenuItems(children, true),
        onTitleClick: item.onTitleClick,
        key: item.key || item.path,
      } as ItemType;
    }

    return {
      label: this.getMenuItemPath(item, isChildren),
      title: this.getIntlName(item),
      key: item.key! || item.path!,
      disabled: item.disabled,
      onClick: (e) => {
        if (isUrl(item?.path)) {
          window.open(item.path);
        }
        item.onTitleClick?.(e);
      },
    };
  };

  getIntlName = (item: MenuDataItem) => {
    const { name, locale } = item;
    const { menu, formatMessage } = this.props;
    if (locale && menu?.locale !== false) {
      return formatMessage?.({
        id: locale,
        defaultMessage: name,
      });
    }
    return name;
  };

  /**
   * 判断是否是http链接.返回 Link 或 a Judge whether it is http link.return a or Link
   *
   * @memberof SiderMenu
   */
  getMenuItemPath = (item: MenuDataItem, isChildren: boolean): React.ReactNode => {
    const itemPath = this.conversionPath(item.path || '/');
    const {
      location = { pathname: '/' },
      isMobile,
      onCollapse,
      menuItemRender,
      iconPrefixes,
    } = this.props;
    // if local is true formatMessage all name。
    const name = this.getIntlName(item);
    const { prefixCls } = this.props;
    const icon = isChildren ? null : getIcon(item.icon, iconPrefixes);
    const isHttpUrl = isUrl(itemPath);
    const defaultItem = (
      <span
        className={classNames(`${prefixCls}-menu-item`, {
          [`${prefixCls}-menu-item-link`]: isHttpUrl,
        })}
      >
        {icon}
        <span className={`${prefixCls}-menu-item-title`}>{name}</span>
      </span>
    );

    if (menuItemRender) {
      const renderItemProps = {
        ...item,
        isUrl: isHttpUrl,
        itemPath,
        isMobile,
        replace: itemPath === location.pathname,
        onClick: () => {
          if (isHttpUrl) window.open(itemPath);
          if (onCollapse) onCollapse(true);
        },
        children: undefined,
      };
      return menuItemRender(renderItemProps, defaultItem, this.props);
    }
    return defaultItem;
  };

  conversionPath = (path: string) => {
    if (path && path.indexOf('http') === 0) {
      return path;
    }
    return `/${path || ''}`.replace(/\/+/g, '/');
  };
}

/**
 * 生成openKeys 的对象，因为设置了openKeys 就会变成受控，所以需要一个空对象
 *
 * @param BaseMenuProps
 */
const getOpenKeysProps = (
  openKeys: React.ReactText[] | false,
  { layout, collapsed }: BaseMenuProps,
): {
  openKeys?: undefined | string[];
} => {
  let openKeysProps = {};
  if (openKeys && !collapsed && ['side', 'mix'].includes(layout || 'mix')) {
    openKeysProps = {
      openKeys,
    };
  }
  return openKeysProps;
};

const BaseMenu: React.FC<BaseMenuProps & PrivateSiderMenuProps> = (props) => {
  const {
    theme,
    mode,
    className,
    handleOpenChange,
    style,
    menuData,
    menu,
    matchMenuKeys,
    iconfontUrl,
    collapsed,
    selectedKeys: propsSelectedKeys,
    onSelect,
    openKeys: propsOpenKeys,
  } = props;

  // 用于减少 defaultOpenKeys 计算的组件
  const defaultOpenKeysRef = useRef<string[]>([]);

  const { flatMenuKeys } = MenuCounter.useContainer();
  const [defaultOpenAll, setDefaultOpenAll] = useMountMergeState(menu?.defaultOpenAll);

  const [openKeys, setOpenKeys] = useMountMergeState<WithFalse<React.Key[]>>(
    () => {
      if (menu?.defaultOpenAll) {
        return getOpenKeysFromMenuData(menuData) || [];
      }
      if (propsOpenKeys === false) {
        return false;
      }
      return [];
    },
    {
      value: propsOpenKeys === false ? undefined : propsOpenKeys,
      onChange: handleOpenChange as any,
    },
  );

  const [selectedKeys, setSelectedKeys] = useMountMergeState<string[] | undefined>([], {
    value: propsSelectedKeys,
    onChange: onSelect
      ? (keys) => {
          if (onSelect && keys) {
            onSelect(keys as any);
          }
        }
      : undefined,
  });

  useEffect(() => {
    if (menu?.defaultOpenAll || propsOpenKeys === false || flatMenuKeys.length) {
      return;
    }
    if (matchMenuKeys) {
      setOpenKeys(matchMenuKeys);
      setSelectedKeys(matchMenuKeys);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchMenuKeys.join('-')]);

  useEffect(() => {
    // reset IconFont
    if (iconfontUrl) {
      IconFont = createFromIconfontCN({
        scriptUrl: iconfontUrl,
      });
    }
  }, [iconfontUrl]);

  useEffect(() => {
    // if pathname can't match, use the nearest parent's key
    if (matchMenuKeys.join('-') !== (selectedKeys || []).join('-')) {
      setSelectedKeys(matchMenuKeys);
    }
    if (
      !defaultOpenAll &&
      propsOpenKeys !== false &&
      matchMenuKeys.join('-') !== (openKeys || []).join('-')
    ) {
      let newKeys: React.Key[] = matchMenuKeys;
      // 如果不自动关闭，我需要把 openKeys 放进去
      if (menu?.autoClose === false) {
        newKeys = Array.from(new Set([...matchMenuKeys, ...(openKeys || [])]));
      }
      setOpenKeys(newKeys);
    } else if (menu?.ignoreFlatMenu && defaultOpenAll) {
      // 忽略用户手动折叠过的菜单状态，折叠按钮切换之后也可实现默认展开所有菜单
      setOpenKeys(getOpenKeysFromMenuData(menuData));
    } else if (flatMenuKeys.length > 0) setDefaultOpenAll(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchMenuKeys.join('-'), collapsed]);

  const openKeysProps = useMemo(
    () => getOpenKeysProps(openKeys, props),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openKeys && openKeys.join(','), props.layout, props.collapsed],
  );

  const [menuUtils] = useState(() => new MenuUtil(props));

  if (menu?.loading) {
    return (
      <div
        style={
          mode?.includes('inline')
            ? { padding: 24 }
            : {
                marginTop: 16,
              }
        }
      >
        <Skeleton
          active
          title={false}
          paragraph={{
            rows: mode?.includes('inline') ? 6 : 1,
          }}
        />
      </div>
    );
  }
  const cls = classNames(className, {
    'top-nav-menu': mode === 'horizontal',
  });

  // sync props
  menuUtils.props = props;

  // 这次 openKeys === false 的时候的情况，这种情况下帮用户选中一次
  // 第二此不会使用，所以用了 defaultOpenKeys
  // 这里返回 null，是为了让 defaultOpenKeys 生效
  if (props.openKeys === false && !props.handleOpenChange) {
    defaultOpenKeysRef.current = matchMenuKeys;
  }

  const finallyData = props.postMenuData ? props.postMenuData(menuData) : menuData;

  if (finallyData && finallyData?.length < 1) {
    return null;
  }
  return (
    <Menu
      {...openKeysProps}
      key="Menu"
      mode={mode}
      items={menuUtils.getNavMenuItems(finallyData, false)}
      inlineIndent={16}
      defaultOpenKeys={defaultOpenKeysRef.current}
      theme={theme}
      selectedKeys={selectedKeys}
      style={style}
      className={cls}
      onOpenChange={setOpenKeys}
      {...props.menuProps}
    />
  );
};

BaseMenu.defaultProps = {
  postMenuData: (data) => data || [],
};

export default BaseMenu;
