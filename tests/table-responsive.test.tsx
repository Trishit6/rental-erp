import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

describe("table responsive", () => {
  it("applies responsive data attributes and classes", () => {
    render(
      <Table data-responsive>
        <TableHeader data-responsive>
          <TableRow data-responsive>
            <TableHead>Name</TableHead>
            <TableHead>Count</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody data-responsive>
          <TableRow data-responsive>
            <TableCell data-label="Name">Item</TableCell>
            <TableCell data-label="Count">5</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    const cells = screen.getAllByText("Item");
    expect(cells[0]).toHaveAttribute("data-label", "Name");
  });
});
