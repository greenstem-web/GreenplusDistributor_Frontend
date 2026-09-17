import React, { useCallback, useEffect, useState } from "react";
import DataGrid, { Column, HeaderFilter, Paging, SearchPanel, Scrolling } from "devextreme-react/data-grid";
import SelectBox from "devextreme-react/select-box";
import Switch from "devextreme-react/switch";
import LoadPanel from "devextreme-react/load-panel";
import notify from "devextreme/ui/notify";
import * as catalogApi from "../../api/catalog";
import { describeError } from "../../api/baseapi";
import "./catalog.css";

/** What the server did, phrased for a person. Keyed on `action`, never guessed from the switch. */
const ACTION_MESSAGE = {
  created: (visible) => (visible ? "Shown for this company." : "Hidden for this company."),
  updated: (visible) => (visible ? "Shown for this company." : "Hidden for this company."),
  removed: () => "Back to the catalog default - the override was removed.",
  unchanged: () => "No change.",
};

export default function CatalogPage() {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState([]);

  const fail = useCallback((error, fallback) => {
    notify({ message: describeError(error, fallback).message, type: "error", displayTime: 6000 }, "error", 6000);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await catalogApi.getCompanies();
        if (cancelled) return;

        setCompanies(list);

        // Auto-select when there is exactly one, which is the common case for a small distributor.
        // With several, leaving it unselected is deliberate: picking one for the user invites
        // changing visibility for a company they were not looking at.
        if (list.length === 1) setCompanyId(list[0].companyId);
        else setLoading(false);
      } catch (error) {
        if (!cancelled) {
          fail(error, "Could not load your companies.");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fail]);

  useEffect(() => {
    if (companyId === null) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    catalogApi
      .getCatalogForCompany(companyId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((error) => {
        if (!cancelled) {
          setItems([]);
          fail(error, "Could not load the catalog for this company.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, fail]);

  const toggle = useCallback(
    async (row, visible) => {
      setSavingIds((ids) => [...ids, row.distributorStockId]);

      try {
        const result = await catalogApi.setVisibility(companyId, row.distributorStockId, visible);

        // Patch from the RESPONSE, not from `visible`. Setting a value back to the default deletes
        // the override, so isOverride can come back false on a change the user just made - and the
        // badge has to follow the server, not the switch.
        setItems((current) =>
          current.map((item) =>
            item.distributorStockId === result.distributorStockId
              ? { ...item, visible: result.visible, isOverride: result.isOverride }
              : item
          )
        );

        const message = (ACTION_MESSAGE[result.action] || ACTION_MESSAGE.unchanged)(result.visible);
        notify({ message: `${row.code}: ${message}`, type: "success", displayTime: 2500 }, "success", 2500);
      } catch (error) {
        // The switch already moved optimistically in the DOM, so re-set the row from what we still
        // believe. Without this the UI shows a state the server rejected.
        setItems((current) => current.map((item) => ({ ...item })));
        fail(error, "Could not change visibility.");
      } finally {
        setSavingIds((ids) => ids.filter((id) => id !== row.distributorStockId));
      }
    },
    [companyId, fail]
  );

  const renderVisible = useCallback(
    (cell) => {
      const row = cell.data;
      return (
        <Switch
          value={row.visible}
          disabled={savingIds.includes(row.distributorStockId)}
          onValueChanged={(e) => {
            // DevExtreme fires onValueChanged for programmatic changes too - including the re-render
            // after a save. Without this guard, patching state would call the API again, and the
            // second call would toggle the value straight back.
            if (!e.event) return;
            toggle(row, e.value);
          }}
        />
      );
    },
    [savingIds, toggle]
  );

  const renderOverride = useCallback((cell) => {
    const row = cell.data;
    if (!row.isOverride) {
      return <span className="catalog-default">default ({row.defaultVisible ? "shown" : "hidden"})</span>;
    }
    return <span className="catalog-override">override</span>;
  }, []);

  const selectedCompany = companies.find((c) => c.companyId === companyId);

  return (
    <div className="catalog-page">
      <div className="catalog-toolbar">
        <div className="catalog-field">
          <label className="catalog-label" htmlFor="company">
            Company
          </label>
          <SelectBox
            inputAttr={{ id: "company" }}
            dataSource={companies}
            valueExpr="companyId"
            displayExpr="companyName"
            value={companyId}
            placeholder={companies.length ? "Select a company" : "No companies yet"}
            disabled={!companies.length}
            searchEnabled={companies.length > 8}
            width={320}
            onSelectionChanged={(e) => {
              // Lookups report a user pick through onSelectionChanged, not onValueChanged.
              if (e.selectedItem) setCompanyId(e.selectedItem.companyId);
            }}
          />
        </div>

        {selectedCompany && !selectedCompany.isConsenting && (
          <div className="catalog-warning">
            This company has not consented to sharing movement data. Visibility still applies; sales
            analytics will stay empty until consent is given.
          </div>
        )}
      </div>

      {companyId === null ? (
        <div className="catalog-empty">
          {companies.length
            ? "Select a company to see which of your catalog items it can use."
            : "No companies are linked to your account yet."}
        </div>
      ) : (
        <DataGrid
          className="listing-datagrid"
          dataSource={items}
          keyExpr="distributorStockId"
          showBorders={true}
          columnAutoWidth={true}
          rowAlternationEnabled={true}
          noDataText={loading ? "" : "This company has no catalog items."}
          height="calc(100vh - 190px)"
        >
          <SearchPanel visible={true} width={260} placeholder="Search code or name" />
          <HeaderFilter visible={true} />
          <Scrolling mode="virtual" />
          <Paging enabled={false} />

          <Column dataField="code" caption="Code" width={140} />
          <Column dataField="name" caption="Name" />
          <Column dataField="uom" caption="UOM" width={90} alignment="center" />
          <Column dataField="barcode" caption="Barcode" width={160} />
          <Column
            dataField="visible"
            caption="Visible"
            width={100}
            alignment="center"
            allowHeaderFiltering={true}
            cellRender={renderVisible}
          />
          <Column
            caption="Source"
            width={160}
            allowSorting={false}
            allowFiltering={false}
            cellRender={renderOverride}
          />
        </DataGrid>
      )}

      <LoadPanel visible={loading} showPane={true} position={{ of: ".catalog-page" }} />
    </div>
  );
}
